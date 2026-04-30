from django.urls import path
from .views import (
    ProductListCreateView,
    ProductDetailView,
    CategoryList,
    AllergenList,
    ProductReviewListCreateView,
    ProducerReviewResponseView,
    ProductNotificationView,
    ProductWholesalePriceView,
    ProducerAnalyticsView,
    PlatformRevenueView,
)

urlpatterns = [
    # Sprint 1 & 2 — unchanged
    path('products/', ProductListCreateView.as_view(), name='product-list'),
    path('products/<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('categories/', CategoryList.as_view(), name='category-list'),
    path('allergens/', AllergenList.as_view(), name='allergen-list'),

    # Sprint 3 — Reviews (TC-023, TC-024)
    path('products/<int:pk>/reviews/', ProductReviewListCreateView.as_view(), name='product-reviews'),
    path('products/<int:pk>/reviews/<int:review_id>/respond/', ProducerReviewResponseView.as_view(), name='review-respond'),

    # Sprint 3 — Notifications (TC-016)
    path('products/<int:pk>/notify/', ProductNotificationView.as_view(), name='product-notify'),

    # Sprint 3 — Wholesale Pricing (TC-019, TC-020)
    path('products/<int:pk>/wholesale/', ProductWholesalePriceView.as_view(), name='product-wholesale'),

    # Sprint 3 — Analytics (TC-017)
    path('producer/analytics/', ProducerAnalyticsView.as_view(), name='producer-analytics'),

    # Sprint 3 — Platform Revenue (TC-018)
    path('admin/revenue/', PlatformRevenueView.as_view(), name='platform-revenue'),
]
