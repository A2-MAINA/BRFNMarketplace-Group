from rest_framework import generics, permissions, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from .models import Product, Category, Allergen, Review, Notification, WholesalePrice
from .serializers import (
    ProductSerializer, CategorySerializer, AllergenSerializer,
    ProductInventoryUpdateSerializer, ReviewSerializer, ReviewCreateSerializer,
    ProducerResponseSerializer, NotificationSerializer, WholesalePriceSerializer,
)
from users.permissions import IsProducer, IsOwner

class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['category', 'availability', 'is_organic']
    search_fields = ['name', 'description']

    def get_queryset(self):
        queryset = Product.objects.all()
        if self.request.query_params.get('mine'):
            if self.request.user.is_authenticated:
                queryset = queryset.filter(producer=self.request.user)
            else:
                queryset = queryset.none()
        return queryset

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), IsProducer()]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        serializer.save(producer=self.request.user)

class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.all()

    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return ProductInventoryUpdateSerializer
        return ProductSerializer

    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [permissions.IsAuthenticated(), IsProducer(), IsOwner()]
        return [permissions.AllowAny()]

    def perform_update(self, serializer):
        """
        TC-016 — trigger availability notifications when product comes back in season.
        After saving, check if availability changed to in_season and notify subscribers.
        """
        old_availability = self.get_object().availability
        instance = serializer.save()
        # If product just became in_season — notify all subscribers
        if old_availability != 'in_season' and instance.availability == 'in_season':
            Notification.objects.filter(
                product=instance,
                notified=False
            ).update(
                notified=True,
                notified_at=timezone.now()
            )

class CategoryList(generics.ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]

class AllergenList(generics.ListAPIView):
    queryset = Allergen.objects.all()
    serializer_class = AllergenSerializer
    permission_classes = [permissions.AllowAny]




# ============================
# Product Reviews (TC-023, TC-024)
# ============================

class ProductReviewListCreateView(APIView):
    """
    GET  — list all reviews for a product (public)
    POST — submit a review (customer only, must have delivered order)
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get(self, request, pk):
        try:
            product = Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=404)

        reviews = Review.objects.filter(product=product).order_by('-created_at')
        serializer = ReviewSerializer(reviews, many=True)

        # Calculate average rating
        total = sum(r.rating for r in reviews)
        avg = round(total / len(reviews), 1) if reviews else 0

        return Response({
            'average_rating': avg,
            'total_reviews': reviews.count(),
            'reviews': serializer.data,
        })

    def post(self, request, pk):
        if request.user.role not in ['customer', 'restaurant', 'community_group']:
            return Response({'error': 'Only customers can submit reviews.'}, status=403)

        try:
            product = Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=404)

        serializer = ReviewCreateSerializer(
            data=request.data,
            context={'request': request, 'product': product}
        )
        if serializer.is_valid():
            review = serializer.save()
            return Response(ReviewSerializer(review).data, status=201)
        return Response(serializer.errors, status=400)


class ProducerReviewResponseView(APIView):
    """
    PATCH — producer responds to a review on their product (TC-024)
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk, review_id):
        if request.user.role != 'producer':
            return Response({'error': 'Only producers can respond to reviews.'}, status=403)

        try:
            product = Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=404)

        # Producer can only respond to reviews on their own products
        if product.producer != request.user:
            return Response({'error': 'You can only respond to reviews on your own products.'}, status=403)

        try:
            review = Review.objects.get(pk=review_id, product=product)
        except Review.DoesNotExist:
            return Response({'error': 'Review not found.'}, status=404)

        serializer = ProducerResponseSerializer(data=request.data)
        if serializer.is_valid():
            serializer.update(review, serializer.validated_data)
            return Response(ReviewSerializer(review).data)
        return Response(serializer.errors, status=400)


# ============================
# Availability Notifications (TC-016)
# ============================

class ProductNotificationView(APIView):
    """
    POST   — subscribe to availability notification
    DELETE — unsubscribe from availability notification
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in ['customer', 'restaurant', 'community_group']:
            return Response({'error': 'Only customers can subscribe to notifications.'}, status=403)

        try:
            product = Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=404)

        notification, created = Notification.objects.get_or_create(
            product=product,
            customer=request.user,
        )
        if not created:
            return Response({'message': 'Already subscribed to this product.'}, status=200)

        return Response(NotificationSerializer(notification).data, status=201)

    def delete(self, request, pk):
        try:
            product = Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=404)

        try:
            notification = Notification.objects.get(product=product, customer=request.user)
            notification.delete()
            return Response({'message': 'Unsubscribed successfully.'}, status=200)
        except Notification.DoesNotExist:
            return Response({'error': 'No subscription found.'}, status=404)


# ============================
# Wholesale Pricing (TC-019, TC-020)
# ============================

class ProductWholesalePriceView(APIView):
    """
    GET  — get wholesale price for logged-in user role
    POST — producer sets wholesale price for a product
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        if request.user.role not in ['restaurant', 'community_group']:
            return Response({'error': 'Wholesale prices are only available for restaurants and community groups.'}, status=403)

        try:
            product = Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=404)

        try:
            wholesale = WholesalePrice.objects.get(
                product=product,
                buyer_type=request.user.role,
                is_active=True
            )
            return Response(WholesalePriceSerializer(wholesale).data)
        except WholesalePrice.DoesNotExist:
            return Response({'error': 'No wholesale price available for your account type.'}, status=404)

    def post(self, request, pk):
        if request.user.role != 'producer':
            return Response({'error': 'Only producers can set wholesale prices.'}, status=403)

        try:
            product = Product.objects.get(pk=pk, producer=request.user)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found or you do not own this product.'}, status=404)

        serializer = WholesalePriceSerializer(
            data=request.data,
            context={'product': product}
        )
        if serializer.is_valid():
            # Update if exists, create if not
            wholesale, created = WholesalePrice.objects.update_or_create(
                product=product,
                buyer_type=request.data.get('buyer_type'),
                defaults={
                    'price': serializer.validated_data['price'],
                    'minimum_quantity': serializer.validated_data.get('minimum_quantity', 1),
                    'is_active': serializer.validated_data.get('is_active', True),
                }
            )
            return Response(WholesalePriceSerializer(wholesale).data, status=201 if created else 200)
        return Response(serializer.errors, status=400)


# ============================
# Producer Analytics (TC-017)
# ============================

class ProducerAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != 'producer':
            return Response({'error': 'Only producers can view analytics.'}, status=403)

        from decimal import Decimal
        from orders.models import OrderProducerGroup, OrderItem
        from django.db.models import Sum, Count, F
        import datetime

        # All delivered groups for this producer
        groups = OrderProducerGroup.objects.filter(
            producer=request.user,
            status='delivered'
        )

        total_revenue = groups.aggregate(Sum('producer_payout'))['producer_payout__sum'] or Decimal('0.00')
        total_commission = groups.aggregate(Sum('commission'))['commission__sum'] or Decimal('0.00')
        total_orders = groups.count()
        avg_order_value = round(total_revenue / total_orders, 2) if total_orders > 0 else Decimal('0.00')

        # Top 5 products by revenue
        from django.db.models import F
        top_items = OrderItem.objects.filter(
            producer=request.user,
            producer_group__status='delivered'
        ).values('product_name_at_time_of_order').annotate(
            units_sold=Sum('quantity'),
            revenue=Sum(F('price_at_time_of_order') * F('quantity'))
        ).order_by('-revenue')[:5]

        top_products = [
            {
                'name': item['product_name_at_time_of_order'],
                'units_sold': item['units_sold'],
                'revenue': str(item['revenue'] or 0),
            }
            for item in top_items
        ]

        # Weekly revenue — last 8 weeks
        weekly_revenue = []
        today = datetime.date.today()
        for i in range(7, -1, -1):
            week_start = today - datetime.timedelta(days=today.weekday() + 7 * i)
            week_end = week_start + datetime.timedelta(days=6)
            week_groups = groups.filter(
                order__updated_at__date__gte=week_start,
                order__updated_at__date__lte=week_end,
            )
            week_revenue = week_groups.aggregate(Sum('producer_payout'))['producer_payout__sum'] or Decimal('0.00')
            weekly_revenue.append({
                'week': str(week_start),
                'revenue': str(week_revenue),
            })

        return Response({
            'total_revenue': str(total_revenue),
            'total_orders': total_orders,
            'average_order_value': str(avg_order_value),
            'total_commission_paid': str(total_commission),
            'top_products': top_products,
            'weekly_revenue': weekly_revenue,
        })


# ============================
# Platform Revenue Report (TC-018)
# ============================

class PlatformRevenueView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access only.'}, status=403)

        from decimal import Decimal
        from orders.models import OrderProducerGroup
        from django.db.models import Sum, Count
        from django.contrib.auth import get_user_model
        User = get_user_model()

        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        groups = OrderProducerGroup.objects.filter(status='delivered')
        if from_date:
            groups = groups.filter(order__updated_at__date__gte=from_date)
        if to_date:
            groups = groups.filter(order__updated_at__date__lte=to_date)

        total_revenue = groups.aggregate(Sum('subtotal'))['subtotal__sum'] or Decimal('0.00')
        total_commission = groups.aggregate(Sum('commission'))['commission__sum'] or Decimal('0.00')
        total_payouts = groups.aggregate(Sum('producer_payout'))['producer_payout__sum'] or Decimal('0.00')
        total_orders = groups.values('order').distinct().count()
        active_producers = groups.values('producer').distinct().count()
        active_customers = groups.values('order__customer').distinct().count()

        # Revenue breakdown per producer
        from django.db.models import Sum as DSum
        producer_breakdown = groups.values(
            'producer__email'
        ).annotate(
            subtotal=DSum('subtotal'),
            commission=DSum('commission'),
            payout=DSum('producer_payout'),
            orders=Count('id')
        ).order_by('-subtotal')

        revenue_by_producer = [
            {
                'producer_email': row['producer__email'],
                'subtotal': str(row['subtotal'] or 0),
                'commission': str(row['commission'] or 0),
                'payout': str(row['payout'] or 0),
                'orders': row['orders'],
            }
            for row in producer_breakdown
        ]

        return Response({
            'total_revenue': str(total_revenue),
            'total_commission': str(total_commission),
            'total_producer_payouts': str(total_payouts),
            'total_orders': total_orders,
            'active_producers': active_producers,
            'active_customers': active_customers,
            'revenue_by_producer': revenue_by_producer,
            'from_date': from_date,
            'to_date': to_date,
        })
