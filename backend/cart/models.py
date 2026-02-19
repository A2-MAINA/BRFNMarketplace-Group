# Import Django's model field types
from django.db import models
# Reference User model via settings — Django best practice
from django.conf import settings

# Shopping cart model 
class Cart(models.Model):
    """
    One cart per customer. Persists during browsing session.
    Price calculations are done via methods, not stored fields,
    to always reflect current product prices.
    """

    # One cart per customer — OneToOneField enforces this at database level
    customer = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='cart'
    )

    # Auto-set when the cart is first created
    created_at = models.DateTimeField(auto_now_add=True)

    # Auto-updated every time the cart is modified — supports future cart expiry
    updated_at = models.DateTimeField(auto_now=True)

    def get_cart_total(self):
        """Sum of all item totals in the cart — always calculated, never stored."""
        return sum(item.get_item_total() for item in self.items.all())

    def __str__(self):
        return f"Cart — {self.customer.email}"
    
    # Individual item in a cart — links a product to a cart with a quantity
class CartItem(models.Model):
    """
    Each row represents one product in a customer's cart.
    Price is calculated from the product's current price, not stored.
    """

    # Which cart this item belongs to — CASCADE deletes items if cart is deleted
    cart = models.ForeignKey(
        Cart,
        on_delete=models.CASCADE,
        related_name='items'
    )

    # Which product — CASCADE removes from cart if product is deleted by producer
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='cart_items'
    )

    # Select quantity: 2 kg — default 1
    quantity = models.PositiveIntegerField(default=1)

    # Tracks when the item was added to the cart
    added_at = models.DateTimeField(auto_now_add=True)

    def get_item_total(self):
        """Price × quantity — always uses current product price, never stale."""
        return self.product.price * self.quantity

    class Meta:
        # Prevents duplicate products in the same cart — database-level constraint
        unique_together = ('cart', 'product')

    def __str__(self):
        return f"{self.quantity}x {self.product.name} in {self.cart.customer.email}'s cart"