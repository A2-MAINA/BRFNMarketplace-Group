from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
import datetime

from django.db.models import Sum, F, DecimalField
from django.db.models.functions import Coalesce
from .models import Order, OrderProducerGroup, OrderStatusHistory, Payment, Dispute, OrderItem
from .serializers import (
    OrderSerializer,
    OrderCreateSerializer,
    OrderStatusUpdateSerializer,
    SettlementSerializer,
    SettlementOrderSerializer,
    PaymentSerializer,
    DisputeSerializer,
    DisputeReadSerializer,
    DisputeResolveSerializer,
)
from products.models import Product
from products.serializers import ProductSerializer


# ============================
# Permission Helpers
# ============================

class IsCustomer(IsAuthenticated):
    # Allows access only to authenticated users with the customer role.
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == 'customer'

class IsProducer(IsAuthenticated):
    # Allows access only to authenticated users with the producer role.
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == 'producer'

class IsAdmin(IsAuthenticated):
    # Allows access only to authenticated users with the admin role.
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == 'admin'


# ============================
# Customer — Create Order & Order History
# TC-007, TC-008, TC-021
# ============================

class OrderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    # Returns the authenticated customer's order history.
    def get(self, request):
        # TC-021 — customer order history
        if request.user.role != 'customer':
            return Response({'error': 'Only customers can view order history.'}, status=403)
        orders = Order.objects.filter(customer=request.user).order_by('-created_at')
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    # Creates a new order for the authenticated customer.
    def post(self, request):
        # TC-007, TC-008 — create order
        if request.user.role != 'customer':
            return Response({'error': 'Only customers can place orders.'}, status=403)
        serializer = OrderCreateSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            order = serializer.save()
            return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ============================
# Customer — Order Detail & Cancel
# TC-007, TC-021
# ============================

class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    # Fetches an order only when the requesting user is allowed to access it.
    def get_order(self, pk, user):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return None
        # Customer can only see their own orders
        if user.role == 'customer' and order.customer != user:
            return None
        return order

    # Returns one order in full detail.
    def get(self, request, pk):
        order = self.get_order(pk, request.user)
        if not order:
            return Response({'error': 'Order not found.'}, status=404)
        return Response(OrderSerializer(order).data)

    # Cancels an eligible customer order and records the status change.
    def patch(self, request, pk):
        # Cancel order — customer only
        if request.user.role != 'customer':
            return Response({'error': 'Only customers can cancel orders.'}, status=403)
        order = self.get_order(pk, request.user)
        if not order:
            return Response({'error': 'Order not found.'}, status=404)
        if not order.can_be_cancelled():
            return Response(
                {'error': 'This order cannot be cancelled. It may already be confirmed or the cancellation window has passed.'},
                status=400
            )
        order.status = 'cancelled'
        order.save(update_fields=['status'])
        OrderStatusHistory.objects.create(
            order=order,
            status='cancelled',
            changed_by=request.user,
            note='Cancelled by customer.',
        )
        return Response(OrderSerializer(order).data)


# ============================
# Producer — Order Dashboard
# TC-009
# ============================

class ProducerOrderListView(APIView):
    permission_classes = [IsAuthenticated]

    # Returns the producer dashboard view of their own producer groups.
    def get(self, request):
        if request.user.role != 'producer':
            return Response({'error': 'Only producers can access this.'}, status=403)

        # Filter by status if provided
        status_filter = request.query_params.get('status')
        groups = OrderProducerGroup.objects.filter(
            producer=request.user
        ).select_related('order').order_by('delivery_date')

        if status_filter:
            groups = groups.filter(status=status_filter)

        # Build response — producer sees only their group, not other producers
        data = []
        for group in groups:
            order = group.order
            data.append({
                'id': group.pk,
                'order_id': order.pk,
                'invoice_number': order.invoice_number,
                'order_date': order.created_at,
                'delivery_date': group.delivery_date or order.delivery_date,
                'status': group.status,
                'fulfilment_type': group.fulfilment_type,
                'special_instructions': order.special_instructions,
                'delivery_address': order.delivery_address,
                'delivery_postcode': order.delivery_postcode,
                'subtotal': group.subtotal,
                'commission': group.commission,
                'producer_payout': group.producer_payout,
                'delivery_fee': group.delivery_fee,
                'customer': {
                    'email': order.customer.email,
                    'name': getattr(getattr(order.customer, 'customer_profile', None), 'full_name', order.customer.email),
                    'phone': getattr(getattr(order.customer, 'customer_profile', None), 'phone_number', ''),
                },
                'items': [
                    {
                        'product_name': item.product_name_at_time_of_order,
                        'quantity': item.quantity,
                        'unit': item.unit_at_time_of_order,
                        'price': item.price_at_time_of_order,
                        'item_total': item.get_item_total(),
                    }
                    for item in group.items.all()
                ],
                'status_history': [
                    {
                        'status': h.status,
                        'changed_by': h.changed_by.email if h.changed_by else None,
                        'note': h.note,
                        'changed_at': h.changed_at,
                    }
                    for h in order.status_history.all()
                ],
            })
        return Response(data)


# ============================
# Producer — Update Order Status
# TC-010
# ============================

class ProducerOrderStatusView(APIView):
    permission_classes = [IsAuthenticated]

    # Advances a producer group's status and returns the updated parent order.
    def patch(self, request, pk):
        if request.user.role != 'producer':
            return Response({'error': 'Only producers can update order status.'}, status=403)

        # Look up by group PK first, fall back to order PK for backwards compatibility
        try:
            group = OrderProducerGroup.objects.get(pk=pk, producer=request.user)
        except OrderProducerGroup.DoesNotExist:
            try:
                group = OrderProducerGroup.objects.get(order__pk=pk, producer=request.user)
            except OrderProducerGroup.DoesNotExist:
                return Response({'error': 'Order not found.'}, status=404)

        order = group.order
        serializer = OrderStatusUpdateSerializer(
            order,
            data=request.data,
            context={'request': request, 'order': order, 'group': group}
        )
        if serializer.is_valid():
            updated_order = serializer.save()
            return Response(OrderSerializer(updated_order).data)
        return Response(serializer.errors, status=400)


# ============================
# Producer — Settlement Report
# TC-012
# ============================

class ProducerSettlementView(APIView):
    permission_classes = [IsAuthenticated]

    # Builds a weekly settlement summary for the current producer.
    def get(self, request):
        if request.user.role != 'producer':
            return Response({'error': 'Only producers can view settlements.'}, status=403)

        # Default to current week — support ?week=YYYY-WW
        week_param = request.query_params.get('week')
        today = datetime.date.today()

        if week_param:
            try:
                year, week = week_param.split('-')
                week_start = datetime.datetime.strptime(f'{year}-W{week}-1', '%Y-W%W-%w').date()
            except Exception:
                return Response({'error': 'Invalid week format. Use YYYY-WW.'}, status=400)
        else:
            week_start = today - datetime.timedelta(days=today.weekday())

        week_end = week_start + datetime.timedelta(days=6)

        # Delivered groups for this producer within this week
        # Use order.updated_at as the settlement date since payment.processed_at
        # may not be set until ALL groups in a multi-vendor order are delivered
        groups = OrderProducerGroup.objects.filter(
            producer=request.user,
            status='delivered',
            order__updated_at__date__gte=week_start,
            order__updated_at__date__lte=week_end,
        )

        from decimal import Decimal
        gross_sales = sum(g.subtotal for g in groups) or Decimal('0.00')
        commission = sum(g.commission for g in groups) or Decimal('0.00')
        net_payout = sum(g.producer_payout for g in groups) or Decimal('0.00')

        data = {
            'week_start': week_start,
            'week_end': week_end,
            'total_orders': groups.count(),
            'gross_sales': gross_sales,
            'commission': commission,
            'net_payout': net_payout,
            'orders': SettlementOrderSerializer(groups, many=True).data,
        }
        return Response(data)


# ============================
# Admin — Commission Report
# TC-025
# ============================

class AdminCommissionReportView(APIView):
    permission_classes = [IsAuthenticated]

    # Returns an admin-facing commission report across delivered producer groups.
    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access only.'}, status=403)

        # Optional date range filters
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        groups = OrderProducerGroup.objects.filter(
            status='delivered'
        ).select_related('order', 'producer')

        if from_date:
            groups = groups.filter(order__updated_at__date__gte=from_date)
        if to_date:
            groups = groups.filter(order__updated_at__date__lte=to_date)

        from decimal import Decimal
        total_commission = sum(g.commission for g in groups) or Decimal('0.00')
        total_payout = sum(g.producer_payout for g in groups) or Decimal('0.00')
        total_sales = sum(g.subtotal for g in groups) or Decimal('0.00')

        rows = [
            {
                'invoice_number': g.order.invoice_number,
                'producer_email': g.producer.email,
                'producer_business': getattr(getattr(g.producer, 'producer_profile', None), 'business_name', ''),
                'subtotal': g.subtotal,
                'commission': g.commission,
                'producer_payout': g.producer_payout,
                'processed_at': getattr(getattr(g.order, 'payment', None), 'processed_at', None),
            }
            for g in groups
        ]

        return Response({
            'total_sales': total_sales,
            'total_commission': total_commission,
            'total_payout': total_payout,
            'orders': rows,
        })


# ============================
# Payment — Create Intent & Confirm
# TC-007, TC-008
# ============================

class CreatePaymentIntentView(APIView):
    permission_classes = [IsAuthenticated]

    # Creates a Stripe payment intent for a customer's order.
    def post(self, request):
        if request.user.role != 'customer':
            return Response({'error': 'Only customers can make payments.'}, status=403)

        order_id = request.data.get('order_id')
        try:
            order = Order.objects.get(pk=order_id, customer=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found.'}, status=404)

        import os
        import stripe
        stripe_secret_key = os.environ.get('STRIPE_SECRET_KEY', '')
        if not stripe_secret_key:
            return Response(
                {'error': 'STRIPE_SECRET_KEY is not configured on the backend.'},
                status=500
            )
        stripe.api_key = stripe_secret_key

        try:
            amount_pence = int(order.total_amount * 100)
            intent = stripe.PaymentIntent.create(
                amount=amount_pence,
                currency='gbp',
                # Ensure we explicitly use card payments (required unless the Stripe account has
                # automatic payment methods configured).
                payment_method_types=['card'],
                metadata={'order_id': order.pk, 'invoice': order.invoice_number}
            )
            order.stripe_payment_intent_id = intent['id']
            order.save(update_fields=['stripe_payment_intent_id'])
            return Response({'client_secret': intent['client_secret']})
        except Exception as e:
            return Response({'error': str(e)}, status=400)


class ConfirmPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    # Marks the order payment as processed after checkout confirmation.
    def post(self, request):
        if request.user.role != 'customer':
            return Response({'error': 'Only customers can confirm payments.'}, status=403)

        order_id = request.data.get('order_id')
        payment_intent_id = request.data.get('payment_intent_id')

        try:
            order = Order.objects.get(pk=order_id, customer=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found.'}, status=404)

        try:
            payment = order.payment
            payment.transaction_id = payment_intent_id
            payment.status = 'processed'
            payment.paid_at = timezone.now()
            payment.save(update_fields=['transaction_id', 'status', 'paid_at'])
        except Payment.DoesNotExist:
            return Response({'error': 'Payment record not found.'}, status=404)

        return Response(OrderSerializer(order).data)


class OrderDisputeView(APIView):
    permission_classes = [IsAuthenticated]

    # Fetches an order candidate for dispute operations.
    def get_order(self, request, pk):
        try:
            return Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return None

    # Opens a dispute for a delivered order owned by the customer.
    def post(self, request, pk):
        if request.user.role != 'customer':
            return Response({'error': 'Only customers can raise disputes.'}, status=403)

        order = self.get_order(request, pk)
        if not order:
            return Response({'error': 'Order not found.'}, status=404)
        if order.customer_id != request.user.id:
            return Response({'error': 'You can only dispute your own orders.'}, status=403)
        if order.status != 'delivered':
            return Response({'error': 'You can only dispute orders that have been delivered.'}, status=400)

        existing = getattr(order, 'dispute', None)
        if existing:
            return Response({'error': 'A dispute has already been raised for this order.'}, status=400)

        serializer = DisputeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dispute = Dispute.objects.create(
            order=order,
            customer=request.user,
            reason=serializer.validated_data['reason'],
            description=serializer.validated_data['description'],
        )
        return Response(DisputeReadSerializer(dispute).data, status=status.HTTP_201_CREATED)

    # Returns the dispute already attached to the given customer order.
    def get(self, request, pk):
        if request.user.role != 'customer':
            return Response({'error': 'Only customers can view disputes.'}, status=403)

        order = self.get_order(request, pk)
        if not order:
            return Response({'error': 'Order not found.'}, status=404)
        if order.customer_id != request.user.id:
            return Response({'error': 'You can only view disputes for your own orders.'}, status=403)

        dispute = getattr(order, 'dispute', None)
        if not dispute:
            return Response({'error': 'No dispute found for this order.'}, status=404)
        return Response(DisputeReadSerializer(dispute).data, status=status.HTTP_200_OK)


class AdminDisputeResolveView(APIView):
    permission_classes = [IsAuthenticated]

    # Lets an admin resolve or close an existing dispute.
    def patch(self, request, pk):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access only.'}, status=403)

        try:
            dispute = Dispute.objects.select_related('order', 'customer').get(pk=pk)
        except Dispute.DoesNotExist:
            return Response({'error': 'Dispute not found.'}, status=404)

        serializer = DisputeResolveSerializer(instance=dispute, data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(DisputeReadSerializer(updated).data, status=status.HTTP_200_OK)


class ProducerAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    # Returns sales totals and top products for the current producer.
    def get(self, request):
        if request.user.role != 'producer':
            return Response({'error': 'Only producers can view analytics.'}, status=403)

        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        groups = OrderProducerGroup.objects.filter(producer=request.user, status='delivered')
        if from_date:
            groups = groups.filter(order__updated_at__date__gte=from_date)
        if to_date:
            groups = groups.filter(order__updated_at__date__lte=to_date)

        from decimal import Decimal

        totals = groups.aggregate(
            total_revenue=Coalesce(Sum('producer_payout'), Decimal('0.00')),
            total_commission_paid=Coalesce(Sum('commission'), Decimal('0.00')),
        )
        total_orders = groups.count()
        total_revenue = totals['total_revenue']
        average_order_value = (total_revenue / total_orders).quantize(Decimal('0.01')) if total_orders else Decimal('0.00')

        items = OrderItem.objects.filter(
            producer=request.user,
            producer_group__status='delivered',
        )
        if from_date:
            items = items.filter(order__updated_at__date__gte=from_date)
        if to_date:
            items = items.filter(order__updated_at__date__lte=to_date)

        revenue_expr = F('price_at_time_of_order') * F('quantity')
        top_products_qs = (
            items.values('product_name_at_time_of_order')
            .annotate(
                units_sold=Coalesce(Sum('quantity'), 0),
                revenue=Coalesce(Sum(revenue_expr, output_field=DecimalField(max_digits=10, decimal_places=2)), Decimal('0.00')),
            )
            .order_by('-revenue')[:5]
        )
        top_products = [
            {'name': row['product_name_at_time_of_order'], 'units_sold': row['units_sold'], 'revenue': row['revenue']}
            for row in top_products_qs
        ]

        weekly_revenue = []
        today = datetime.date.today()
        current_week_start = today - datetime.timedelta(days=today.weekday())
        for weeks_ago in range(7, -1, -1):
            week_start = current_week_start - datetime.timedelta(weeks=weeks_ago)
            week_end = week_start + datetime.timedelta(days=6)
            revenue = groups.filter(
                order__updated_at__date__gte=week_start,
                order__updated_at__date__lte=week_end,
            ).aggregate(
                revenue=Coalesce(Sum('producer_payout'), Decimal('0.00')),
            )['revenue']
            weekly_revenue.append({'week': week_start.isoformat(), 'revenue': revenue})

        return Response({
            'total_revenue': total_revenue,
            'total_orders': total_orders,
            'average_order_value': average_order_value,
            'total_commission_paid': totals['total_commission_paid'],
            'top_products': top_products,
            'weekly_revenue': weekly_revenue,
        })


class AdminRevenueView(APIView):
    permission_classes = [IsAuthenticated]

    # Returns platform-wide revenue totals for admins.
    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access only.'}, status=403)

        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        groups = OrderProducerGroup.objects.filter(status='delivered')
        if from_date:
            groups = groups.filter(order__updated_at__date__gte=from_date)
        if to_date:
            groups = groups.filter(order__updated_at__date__lte=to_date)

        totals = groups.aggregate(
            total_sales=Coalesce(Sum('subtotal'), 0),
            total_commission=Coalesce(Sum('commission'), 0),
            total_payout=Coalesce(Sum('producer_payout'), 0),
            total_delivery_fees=Coalesce(Sum('delivery_fee'), 0),
        )

        return Response({
            **totals,
            'delivered_producer_groups': groups.count(),
        })
