from django.urls import path
from .views import (
    ProductListCreateView,
    ProductDetailView,
    CategoryList,
    AllergenList,
    ProductReviewsView,
    ProducerReviewRespondView,
    ProductNotifyView,
    ProductWholesaleView,
)

urlpatterns = [
    path('products/', ProductListCreateView.as_view(), name='product-list'),
    path('products/<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('products/<int:pk>/reviews/', ProductReviewsView.as_view(), name='product-reviews'),
    path('products/<int:pk>/reviews/<int:rid>/respond/', ProducerReviewRespondView.as_view(), name='product-review-respond'),
    path('products/<int:pk>/notify/', ProductNotifyView.as_view(), name='product-notify'),
    path('products/<int:pk>/wholesale/', ProductWholesaleView.as_view(), name='product-wholesale'),
    path('categories/', CategoryList.as_view(), name='category-list'),
    path('allergens/', AllergenList.as_view(), name='allergen-list'),
]
