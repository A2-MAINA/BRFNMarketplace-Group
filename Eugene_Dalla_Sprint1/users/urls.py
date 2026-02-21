from django.urls import path

from .views import (
    ProducerRegisterView,
    CustomerRegisterView,
    LoginView,
    LogoutView,
    ProfileView,
)


# Eugene Dalla — Backend API: auth URL routing

urlpatterns = [
    path("register/producer/", ProducerRegisterView.as_view(), name="register-producer"),
    path("register/customer/", CustomerRegisterView.as_view(), name="register-customer"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("profile/", ProfileView.as_view(), name="profile"),
]

