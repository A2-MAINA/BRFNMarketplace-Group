from django.urls import path
from .views import (
    ProducerRegistrationView,
    CustomerRegistrationView,
    LoginView,
    LogoutView,
    ProfileView
)

urlpatterns = [
    path('register/producer/', ProducerRegistrationView.as_view(), name='register-producer'),
    path('register/customer/', CustomerRegistrationView.as_view(), name='register-customer'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('profile/', ProfileView.as_view(), name='profile'),
]
