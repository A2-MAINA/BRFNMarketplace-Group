from django.db import models
from django.conf import settings
from products.models import WholesalePrice


class Cart(models.Model):
    customer = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='cart'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def get_cart_total(self):
        return sum(item.get_item_total() for item in self.items.all())

    def __str__(self):
        return f"Cart — {self.customer.email}"


class CartItem(models.Model):
    cart = models.ForeignKey(
        Cart,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='cart_items'
    )
    quantity = models.PositiveIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    def get_item_total(self):
        buyer_type = self.cart.customer.role
        if buyer_type in {'restaurant', 'community_group'}:
            wholesale = WholesalePrice.objects.filter(
                product=self.product,
                buyer_type=buyer_type,
                is_active=True,
            ).first()
            if wholesale and self.quantity >= wholesale.minimum_quantity:
                return wholesale.price * self.quantity
        return self.product.price * self.quantity

    class Meta:
        unique_together = ('cart', 'product')

    def __str__(self):
        return f"{self.quantity}x {self.product.name} in {self.cart.customer.email}'s cart"

