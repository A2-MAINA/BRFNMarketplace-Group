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

    def get_queryset(self):
        qs = Product.objects.all().order_by("-created_at")
        category_id = self.request.query_params.get("category")
        search = self.request.query_params.get("search")
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
