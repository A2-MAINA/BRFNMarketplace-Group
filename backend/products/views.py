from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticatedOrReadOnly

from users.permissions import IsProducer
from .models import Product, Category
from .serializers import ProductSerializer, CategorySerializer


# Eugene Dalla — Backend API: products + categories endpoints


class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_permissions(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return [IsProducer()]
        return [AllowAny()]

    def perform_create(self, serializer):
        """
        When a producer creates a product, store who owns it.
        """
        user = self.request.user
        serializer.save(producer=user)

    def get_queryset(self):
        qs = Product.objects.all().order_by("-created_at")
        category_id = self.request.query_params.get("category")
        search = self.request.query_params.get("search")
        mine = self.request.query_params.get("mine")

        # For producer dash "My Products": /api/products/?mine=1 returns only their products
        user = self.request.user
        if mine and user and user.is_authenticated and getattr(user, "role", None) == "producer":
            qs = qs.filter(producer=user)

        if category_id:
            qs = qs.filter(category_id=category_id)
        if search:
            qs = qs.filter(name__icontains=search)
        return qs


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsProducer()]
        return [AllowAny()]


class CategoryList(generics.ListAPIView):
    queryset = Category.objects.all().order_by("name")
    serializer_class = CategorySerializer
