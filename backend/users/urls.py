from django.urls import path
from django.views.decorators.csrf import csrf_exempt

from .views import (
    ProducerRegisterView,
    CustomerRegisterView,
    LoginView,
    LogoutView,
    ProfileView,
)


# Eugene Dalla — Backend API: auth URL routing
# csrf_exempt on the URL so middleware sees it (SPA on different origin cannot send token)

urlpatterns = [
    path("register/producer/", csrf_exempt(ProducerRegisterView.as_view()), name="register-producer"),
    path("register/customer/", csrf_exempt(CustomerRegisterView.as_view()), name="register-customer"),
    path("login/", csrf_exempt(LoginView.as_view()), name="login"),
    path("logout/", csrf_exempt(LogoutView.as_view()), name="logout"),
    path("profile/", ProfileView.as_view(), name="profile"),
]

