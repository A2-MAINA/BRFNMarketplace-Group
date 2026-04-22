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
from users.permissions import IsProducer, IsOwner, IsCustomer

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

class CategoryList(generics.ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]

class AllergenList(generics.ListAPIView):
    queryset = Allergen.objects.all()
    serializer_class = AllergenSerializer
    permission_classes = [permissions.AllowAny]


class ProductReviewsView(APIView):
    def get(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        reviews = Review.objects.filter(product=product).select_related('customer')
        avg = reviews.aggregate(avg=Avg('rating'))['avg']
        return Response({
            'average_rating': avg or 0,
            'count': reviews.count(),
            'reviews': ReviewSerializer(reviews, many=True).data,
        })

    def post(self, request, pk):
        if not (request.user.is_authenticated and request.user.role == 'customer'):
            return Response({'detail': 'Customer access only.'}, status=status.HTTP_403_FORBIDDEN)

        product = get_object_or_404(Product, pk=pk)
        serializer = ReviewCreateSerializer(data=request.data, context={'request': request, 'product': product})
        serializer.is_valid(raise_exception=True)
        review = serializer.save()
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class ProducerReviewRespondView(APIView):
    def patch(self, request, pk, rid):
        if not (request.user.is_authenticated and request.user.role == 'producer'):
            return Response({'detail': 'Producer access only.'}, status=status.HTTP_403_FORBIDDEN)

        product = get_object_or_404(Product, pk=pk)
        if product.producer_id != request.user.id:
            return Response({'detail': 'You can only respond to reviews on your own products.'}, status=status.HTTP_403_FORBIDDEN)

        review = get_object_or_404(Review, pk=rid, product=product)
        serializer = ProducerResponseSerializer(instance=review, data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(ReviewSerializer(updated).data)


class ProductNotifyView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def post(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        if product.availability != 'out_of_season':
            return Response({'detail': 'Notifications are only available for out-of-season products.'}, status=status.HTTP_400_BAD_REQUEST)

        sub, _ = AvailabilitySubscription.objects.get_or_create(customer=request.user, product=product)
        return Response(NotificationSerializer(sub).data, status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        AvailabilitySubscription.objects.filter(customer=request.user, product=product).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductWholesaleView(APIView):
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
        price = get_object_or_404(WholesalePrice, product=product, buyer_type=buyer_type)
        return Response(WholesalePriceSerializer(price).data)

    def post(self, request, pk):
        if not (request.user.is_authenticated and request.user.role == 'producer'):
            return Response({'detail': 'Producer access only.'}, status=status.HTTP_403_FORBIDDEN)

        product = get_object_or_404(Product, pk=pk)
        if product.producer_id != request.user.id:
            return Response({'detail': 'You can only set wholesale prices for your own products.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = WholesalePriceSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        buyer_type = serializer.validated_data['buyer_type']
        price_value = serializer.validated_data['price']

        obj, _ = WholesalePrice.objects.update_or_create(
            product=product,
            buyer_type=buyer_type,
            defaults={'price': price_value},
        )
        return Response(WholesalePriceSerializer(obj).data, status=status.HTTP_201_CREATED)
