from rest_framework import generics, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Product, Category, Allergen
from .serializers import ProductSerializer, CategorySerializer, AllergenSerializer
from users.permissions import IsProducer, IsOwner

class ProductListCreateView(generics.ListCreateAPIView):
    """
    GET: List all products. Supports filtering by category, availability, is_organic and searching by name/description.
    POST: Create a new product (Producer only).
    """
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
    """
    GET: Retrieve product details.
    PUT/PATCH/DELETE: Update or delete product (Producer who owns the product only).
    """
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [permissions.IsAuthenticated(), IsProducer(), IsOwner()]
        return [permissions.AllowAny()]

class CategoryList(generics.ListAPIView):
    """
    GET: List all categories.
    """
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]

class AllergenList(generics.ListAPIView):
    """
    GET: List all 14 allergens.
    """
    queryset = Allergen.objects.all()
    serializer_class = AllergenSerializer
    permission_classes = [permissions.AllowAny]