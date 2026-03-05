from django.urls import path
from .views import ProductListCreateView, ProductDetailView, CategoryList

urlpatterns = [
    path('products/', ProductListCreateView.as_view(), name='product-list'),
    path('products/<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('categories/', CategoryList.as_view(), name='category-list'),
]
