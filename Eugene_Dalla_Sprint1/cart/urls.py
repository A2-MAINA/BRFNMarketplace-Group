from django.urls import path

from .views import CartView


# Eugene Dalla — Backend API: cart URL routing

urlpatterns = [
    path("", CartView.as_view(), name="cart"),
]

