from rest_framework import generics, permissions, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Avg
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Product, Category, Allergen, Review, AvailabilitySubscription, WholesalePrice
from .serializers import (
    ProductSerializer,
    CategorySerializer,
    AllergenSerializer,
    ProductInventoryUpdateSerializer,
    ReviewSerializer,
    ReviewCreateSerializer,
    ProducerResponseSerializer,
    NotificationSerializer,
    WholesalePriceSerializer,
    WholesalePriceSetSerializer,
)
from users.permissions import IsProducer, IsOwner, IsCustomer, IsReviewOwner

# Lists all products and lets producers create new ones.
class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['category', 'availability', 'is_organic']
    search_fields = ['name', 'description']

    # Returns the product queryset and optionally filters it to the current producer's own products.
    def get_queryset(self):
        queryset = Product.objects.all()
        if self.request.query_params.get('mine'):
            if self.request.user.is_authenticated:
                queryset = queryset.filter(producer=self.request.user)
            else:
                queryset = queryset.none()
        return queryset

    # Applies producer-only create permissions while keeping reads public.
    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), IsProducer()]
        return [permissions.AllowAny()]

    # Saves newly created products under the authenticated producer.
    def perform_create(self, serializer):
        serializer.save(producer=self.request.user)

# Returns one product and allows the owner producer to update or delete it.
class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.all()

    # Switches to the limited inventory serializer for partial updates.
    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return ProductInventoryUpdateSerializer
        return ProductSerializer

    # Restricts writes to the owning producer while leaving reads public.
    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [permissions.IsAuthenticated(), IsProducer(), IsOwner()]
        return [permissions.AllowAny()]

# Lists all product categories.
class CategoryList(generics.ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]

# Lists all allergens available in the system.
class AllergenList(generics.ListAPIView):
    queryset = Allergen.objects.all()
    serializer_class = AllergenSerializer
    permission_classes = [permissions.AllowAny]


class ProductReviewsView(APIView):
    # Returns the product's reviews along with summary rating information.
    def get(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        reviews = Review.objects.filter(product=product).select_related('customer')
        avg = reviews.aggregate(avg=Avg('rating'))['avg']
        return Response({
            'average_rating': avg or 0,
            'count': reviews.count(),
            'reviews': ReviewSerializer(reviews, many=True).data,
        })

    # Creates a new customer review for the selected product.
    def post(self, request, pk):
        if not (request.user.is_authenticated and request.user.role == 'customer'):
            return Response({'detail': 'Customer access only.'}, status=status.HTTP_403_FORBIDDEN)

        product = get_object_or_404(Product, pk=pk)
        serializer = ReviewCreateSerializer(data=request.data, context={'request': request, 'product': product})
        serializer.is_valid(raise_exception=True)
        review = serializer.save()
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class ProducerReviewRespondView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsProducer, IsReviewOwner]

    # Stores a producer response on a review belonging to one of their products.
    def patch(self, request, pk, rid):
        review = get_object_or_404(Review, pk=rid, product_id=pk)
        serializer = ProducerResponseSerializer(instance=review, data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(ReviewSerializer(updated).data)


class ProductNotifyView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    # Creates or reuses an availability notification subscription for an out-of-season product.
    def post(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        if product.availability != 'out_of_season':
            return Response({'detail': 'Notifications are only available for out-of-season products.'}, status=status.HTTP_400_BAD_REQUEST)

        sub, _ = AvailabilitySubscription.objects.get_or_create(customer=request.user, product=product)
        return Response(NotificationSerializer(sub).data, status=status.HTTP_201_CREATED)

    # Removes the customer's availability notification subscription for a product.
    def delete(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        AvailabilitySubscription.objects.filter(customer=request.user, product=product).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductWholesaleView(APIView):
    # Returns wholesale pricing for the authenticated buyer type.
    def get(self, request, pk):
        if not request.user.is_authenticated:
            return Response({'detail': 'Authentication credentials were not provided.'}, status=status.HTTP_403_FORBIDDEN)

        if request.user.role == 'restaurant':
            buyer_type = 'restaurant'
        elif request.user.role == 'community_group':
            buyer_type = 'community_group'
        else:
            return Response({'detail': 'Wholesale pricing is only available to restaurants and community groups.'}, status=status.HTTP_403_FORBIDDEN)

        product = get_object_or_404(Product, pk=pk)
        price = get_object_or_404(WholesalePrice, product=product, buyer_type=buyer_type, is_active=True)
        return Response(WholesalePriceSerializer(price).data)

    # Creates or updates wholesale pricing for the current producer's own product.
    def post(self, request, pk):
        if not (request.user.is_authenticated and request.user.role == 'producer'):
            return Response({'detail': 'Producer access only.'}, status=status.HTTP_403_FORBIDDEN)

        product = get_object_or_404(Product, pk=pk)
        if product.producer_id != request.user.id:
            return Response({'detail': 'You can only set wholesale prices for your own products.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = WholesalePriceSetSerializer(data=request.data, context={'product': product})
        serializer.is_valid(raise_exception=True)
        buyer_type = serializer.validated_data['buyer_type']
        price_value = serializer.validated_data['price']
        minimum_quantity = serializer.validated_data.get('minimum_quantity', 1)
        is_active = serializer.validated_data.get('is_active', True)

        obj, _ = WholesalePrice.objects.update_or_create(
            product=product,
            buyer_type=buyer_type,
            defaults={'price': price_value, 'minimum_quantity': minimum_quantity, 'is_active': is_active},
        )
        return Response(WholesalePriceSerializer(obj).data, status=status.HTTP_201_CREATED)
