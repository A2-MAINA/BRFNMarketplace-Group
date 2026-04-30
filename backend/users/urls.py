from django.urls import path
from .views import (
    ProducerRegistrationView,
    CustomerRegistrationView,
    RestaurantRegistrationView,
    CommunityGroupRegistrationView,
    LoginView,
    LogoutView,
    ProfileView,
    CSRFView,
    CustomerNotificationsView,
)

urlpatterns = [
    path('csrf/', CSRFView.as_view(), name='csrf'),
    path('register/producer/', ProducerRegistrationView.as_view(), name='register-producer'),
    path('register/customer/', CustomerRegistrationView.as_view(), name='register-customer'),
    path('register/restaurant/', RestaurantRegistrationView.as_view(), name='register-restaurant'),
    path('register/community-group/', CommunityGroupRegistrationView.as_view(), name='register-community-group'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('notifications/', CustomerNotificationsView.as_view(), name='customer-notifications'),
]
