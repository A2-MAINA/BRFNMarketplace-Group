from django.urls import path
from .views import (
    OrderListCreateView,
    OrderDetailView,
    OrderDisputeView,
    ProducerOrderListView,
    ProducerOrderStatusView,
    ProducerSettlementView,
    AdminCommissionReportView,
    CreatePaymentIntentView,
    ConfirmPaymentView,
)

urlpatterns = [
    # Customer — TC-007, TC-008, TC-021
    path('', OrderListCreateView.as_view(), name='order-list-create'),
    path('<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('<int:pk>/cancel/', OrderDetailView.as_view(), name='order-cancel'),
    path('<int:pk>/dispute/', OrderDisputeView.as_view(), name='order-dispute'),

    # Producer — TC-009, TC-010, TC-012
    path('producer/', ProducerOrderListView.as_view(), name='producer-order-list'),
    path('producer/<int:pk>/status/', ProducerOrderStatusView.as_view(), name='producer-order-status'),
    path('settlements/', ProducerSettlementView.as_view(), name='producer-settlements'),

    # Admin — TC-025
    path('admin/commission/', AdminCommissionReportView.as_view(), name='admin-commission'),

    # Payments — TC-007, TC-008
    path('payments/create-intent/', CreatePaymentIntentView.as_view(), name='payment-create-intent'),
    path('payments/confirm/', ConfirmPaymentView.as_view(), name='payment-confirm'),
]
