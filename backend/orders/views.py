from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
import datetime

from .models import Order, OrderProducerGroup, OrderStatusHistory, Payment
from .serializers import (
    OrderSerializer,
    OrderCreateSerializer,
    OrderStatusUpdateSerializer,
    SettlementSerializer,
    SettlementOrderSerializer,
    PaymentSerializer,
)
from products.models import Product
from products.serializers import ProductSerializer


# ============================
# Permission Helpers
# ============================

class IsCustomer(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == 'customer'

class IsProducer(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == 'producer'

class IsAdmin(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == 'admin'


# ============================
# Customer — Create Order & Order History
# TC-007, TC-008, TC-021
# ============================

class OrderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # TC-021 — customer order history
        if request.user.role != 'customer':
            return Response({'error': 'Only customers can view order history.'}, status=403)
        orders = Order.objects.filter(customer=request.user).order_by('-created_at')
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

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

    def get_order(self, pk, user):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return None
        # Customer can only see their own orders
        if user.role == 'customer' and order.customer != user:
            return None
        return order

    def get(self, request, pk):
        order = self.get_order(pk, request.user)
        if not order:
            return Response({'error': 'Order not found.'}, status=404)
        return Response(OrderSerializer(order).data)

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
