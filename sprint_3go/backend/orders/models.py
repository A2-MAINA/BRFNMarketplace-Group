from django.conf import settings
from django.db import models
from django.utils import timezone
from decimal import Decimal
import datetime


class Order(models.Model):
    """
    Represents a customer order in the BRFN marketplace.
    One order can contain items from multiple producers via OrderProducerGroup.
    
    UK Legal compliance:
    - Consumer Rights Act 2015: cancellation only permitted while status is pending
    - Consumer Contracts Regulations 2013: cancellation_deadline field
    - UK GDPR: delivery address stored as snapshot, not a live FK to CustomerProfile
    - HMRC: invoice_number for financial audit trail
    
    Covers TC-007 (single producer) and TC-008 (multi-vendor).
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),          # Order placed, awaiting producer action
        ('confirmed', 'Confirmed'),      # Producer accepted — customer can no longer cancel
        ('processing', 'Processing'),    # Producer is actively preparing the order
        ('ready', 'Ready'),              # Order packed and ready for dispatch or collection
        ('delivered', 'Delivered'),      # Customer received order — payout triggered
        ('cancelled', 'Cancelled'),      # Customer cancelled while pending — full refund
        ('rejected', 'Rejected'),        # Producer rejected while pending — full refund
    ]

    # The customer who placed the order
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='orders'
    )

    # order progresses through status lifecycle
    # No skipping stages, no going backwards — enforced in the API
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )

    # customer selects delivery date
    # Minimum 48 hours from order creation — enforced in the serializer, not the model
    delivery_date = models.DateField()

    # Delivery address — stored as a snapshot at time of order placement 
    # Snapshot protects historical records if customer changes their profile later
    # UK GDPR Article 5(1)(e): data stored no longer than necessary — snapshot avoids
    # storing a live link to personal data that could change
    delivery_address = models.TextField(blank=True, default='')
    delivery_postcode = models.CharField(max_length=10, blank=True, default='')

    
    # Consumer Contracts Regulations 2013: customers have the right to communicate
    # delivery requirements
    special_instructions = models.TextField(blank=True, default='')

    # Financial fields — all calculated at time of order placement 
    # DecimalField used throughout — floats have rounding errors with currency
    # total_amount = sum of all items + total delivery fees
    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Sum of all delivery fees across all OrderProducerGroups
    # Delivery fee is NOT subject to BRFN commission — goes entirely to covering delivery
    total_delivery_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Stripe payment intent ID — stored for payment verification and refunds
    # Set when Stripe creates the payment intent at checkout
    stripe_payment_intent_id = models.CharField(
        max_length=200,
        blank=True,
        default=''
    )

    # HMRC compliance — sequential invoice reference for financial audit trail
    # UK VAT Act 1994 requires invoice numbers for VAT-registered businesses
    invoice_number = models.CharField(
        max_length=50,
        blank=True,
        default=''
    )

    # Consumer Contracts Regulations 2013 — customers have a right to cancel
    # before the seller has acted. Set to 1 hour after order creation.
    # Only valid while status == 'pending'
    cancellation_deadline = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Order #{self.pk} — {self.customer.email} — {self.get_status_display()}"

    def save(self, *args, **kwargs):
        """
        Auto-generate invoice number and cancellation deadline on first save.
        Invoice format: BRFN-YYYY-XXXXXX (e.g. BRFN-2026-000042)
        """
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new:
            # Generate invoice number after PK is assigned
            year = datetime.date.today().year
            self.invoice_number = f"BRFN-{year}-{self.pk:06d}"
            # Set cancellation window — 1 hour from order creation
            self.cancellation_deadline = timezone.now() + datetime.timedelta(hours=1)
            # Save again to persist invoice number and cancellation deadline
            super().save(update_fields=['invoice_number', 'cancellation_deadline'])

    def can_be_cancelled(self):
        """
        Returns True only if:
        1. Order status is still 'pending' — once confirmed, cancellation is not permitted
        2. Cancellation deadline has not passed
        
        Consumer Rights Act 2015: customer can cancel before seller has acted on the order.
        Once producer confirms, they have committed resources — cancellation is no longer fair.
        """
        if self.status != 'pending':
            return False
        if self.cancellation_deadline and timezone.now() > self.cancellation_deadline:
            return False
        return True

    def calculate_totals(self):
        """
        Recalculates order totals from all OrderProducerGroups.
        Call this after all groups and items have been added.
        
        total_amount = sum of all producer group subtotals + total delivery fees
        Commission is calculated per producer group — not on the total order here.
        Delivery fee is excluded from commission — goes entirely to covering delivery costs.
        """
        groups = self.producer_groups.all()
        items_total = sum(g.subtotal for g in groups)
        delivery_total = sum(g.delivery_fee for g in groups)

        self.total_delivery_fee = delivery_total
        self.total_amount = items_total + delivery_total
        self.save(update_fields=['total_amount', 'total_delivery_fee'])


class OrderProducerGroup(models.Model):
    """
    One record per producer per order.
    
    This model is the key to multi-vendor orders (TC-008):
    - Each producer sees only their own group, not other producers' items
    - Each group has its own fulfilment type (delivery or pickup)
    - Each group has its own subtotal and 95/5 commission split
    - Delivery fee is per group — standard, express, or free pickup
    
    The 5% commission is deducted from the PRODUCER's share, not charged to the customer.
    Customer always pays the product price — commission comes out of what the producer earns.
    """

    FULFILMENT_CHOICES = [
        ('standard', 'Standard Delivery (3–5 working days, £2.99)'),
        ('express', 'Express Delivery (1–2 working days, £4.99)'),
        ('pickup', 'Pickup (Free — collect from producer)'),
    ]

    # Fixed platform-wide delivery fees — not set by individual producers
    DELIVERY_FEES = {
        'standard': Decimal('2.99'),
        'express': Decimal('4.99'),
        'pickup': Decimal('0.00'),
    }

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('processing', 'Processing'),
        ('ready', 'Ready'),
        ('delivered', 'Delivered'),
        ('rejected', 'Rejected'),
    ]

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='producer_groups'
    )

    # Which producer owns this group
    producer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='order_producer_groups'
    )

    # Per-group status — each producer progresses their own group independently
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )

    # Customer's fulfilment choice for this producer's items
    # All items from the same producer share the same fulfilment type
    fulfilment_type = models.CharField(
        max_length=20,
        choices=FULFILMENT_CHOICES,
        default='standard'
    )

    # Auto-set from DELIVERY_FEES based on fulfilment_type when group is created
    delivery_fee = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # Producer's address snapshot — auto-filled from ProducerProfile.address if pickup
    # Blank if delivery — customer's address is on the Order instead
    pickup_location = models.TextField(blank=True, default='')

    # Per-producer delivery date — TC-008 allows different dates per producer
    delivery_date = models.DateField(null=True, blank=True)

    # Sum of all OrderItems in this group (product prices only, excluding delivery fee)
    subtotal = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # 5% commission deducted from producer's share — not charged to the customer
    # Calculated on subtotal only — delivery fee is excluded from commission
    commission = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    # 95% of subtotal — what the producer receives after delivery is marked complete
    # Payout is NOT released until the order status hits 'delivered'
    producer_payout = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Prevent duplicate producer groups for the same order
        unique_together = ('order', 'producer')
        ordering = ['created_at']

    def __str__(self):
        return (
            f"Order #{self.order.pk} — "
            f"{self.producer.producer_profile.business_name} — "
            f"{self.get_fulfilment_type_display()}"
        )

    def calculate_financials(self):
        """
        Calculates subtotal, commission (5%), and producer payout (95%)
        from all OrderItems in this group.
        
        Commission is deducted from the producer's share:
        - subtotal = sum of all item totals
        - commission = 5% of subtotal (retained by BRFN)
        - producer_payout = 95% of subtotal (released to producer on delivery)
        
        Both values are rounded to 2 decimal places using quantize()
        to ensure accuracy for financial reporting (TC-012, TC-025).
        Delivery fee is excluded — it goes entirely to covering delivery costs.
        """
        items_total = sum(item.get_item_total() for item in self.items.all())
        commission = (items_total * Decimal('0.05')).quantize(Decimal('0.01'))
        payout = (items_total * Decimal('0.95')).quantize(Decimal('0.01'))

        self.subtotal = items_total
        self.commission = commission
        self.producer_payout = payout
        self.delivery_fee = self.DELIVERY_FEES.get(self.fulfilment_type, Decimal('0.00'))
        self.save(update_fields=['subtotal', 'commission', 'producer_payout', 'delivery_fee'])


class OrderItem(models.Model):
    """
    A single product line within an order, belonging to a specific OrderProducerGroup.
    
    Stores price_at_time_of_order and unit_at_time_of_order as snapshots.
    This is critical for financial accuracy — if a producer changes their price
    after an order is placed, the historical order record remains correct.
    
    Covers TC-007, TC-008, TC-009, TC-012.
    """

    # Which order this item belongs to — direct FK for fast order-level queries
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='items'
    )

    # Which producer group this item belongs to
    producer_group = models.ForeignKey(
        OrderProducerGroup,
        on_delete=models.CASCADE,
        related_name='items'
    )

    # String reference avoids circular import between orders and products apps
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='order_items'
    )

    # Stored directly on OrderItem for fast producer dashboard queries (TC-009)
    # Avoids joining through product every time producer loads their orders
    producer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='received_order_items'
    )

    quantity = models.PositiveIntegerField(default=1)

    # Price snapshot — stored at time of order, never updated after
    # Protects historical financial records if producer changes price later
    price_at_time_of_order = models.DecimalField(
        max_digits=6,
        decimal_places=2
    )

    # Unit snapshot — e.g. 'dozen', 'kg' — for correct display in order history
    unit_at_time_of_order = models.CharField(max_length=10)

    # Product name snapshot — so order history still shows correct name
    # even if producer renames the product later
    product_name_at_time_of_order = models.CharField(max_length=200, default='')

    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['added_at']

    def get_item_total(self):
        """
        Returns total cost for this line item: price × quantity.
        Uses stored price snapshot, not current product price.
        """
        return self.price_at_time_of_order * self.quantity

    def __str__(self):
        return (
            f"{self.quantity}× {self.product_name_at_time_of_order} "
            f"(Order #{self.order.pk})"
        )


class OrderStatusHistory(models.Model):
    """
    Audit log of every status change on an order.
    
    TC-010 requires: 'Status changes are logged with timestamp and producer information'
    TC-022 requires: 'Security logging captures authentication events'
    
    Every status transition is recorded here with who made the change and when.
    This provides a full audit trail for dispute resolution and financial reporting.
    """

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='status_history'
    )

    # The status the order moved TO
    status = models.CharField(max_length=20, choices=Order.STATUS_CHOICES)

    # Who changed the status — customer (for cancellation) or producer (for all other changes)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='order_status_changes'
    )

    # Optional note — TC-010: 'Optional notes can be added to status updates'
    note = models.TextField(blank=True, default='')

    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['changed_at']
        verbose_name_plural = 'Order Status Histories'

    def __str__(self):
        return (
            f"Order #{self.order.pk} → {self.get_status_display()} "
            f"at {self.changed_at.strftime('%d %b %Y %H:%M')}"
        )


class Payment(models.Model):
    """
    Records the financial transaction for an order.
    One Payment per Order.

    Two key timestamps:
    - paid_at: when the customer paid Stripe at checkout
    - processed_at: when the producer payout was released — ONLY set when order is delivered

    This distinction is critical:
    - Money is held after paid_at
    - Money is released to producer only after processed_at (on delivery)
    - Protects customers — if order never arrives, producer hasn't been paid yet

    Covers TC-012 (weekly settlement reports) and TC-025 (admin commission reporting).
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),        # Payment intent created, customer not yet paid
        ('processed', 'Processed'),    # Customer paid and producer payout released
        ('failed', 'Failed'),          # Payment failed or was declined by Stripe
        ('refunded', 'Refunded'),      # Payment refunded — order was cancelled or rejected
    ]

    # One payment per order — OneToOneField enforces this at the database level
    order = models.OneToOneField(
        Order,
        on_delete=models.CASCADE,
        related_name='payment'
    )

    # Stripe payment intent or charge ID — used for reconciliation and refunds
    transaction_id = models.CharField(max_length=200, blank=True, default='')

    # Full amount charged to the customer — product prices + delivery fees
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    # 5% commission retained by BRFN — calculated on product total only, not delivery fee
    commission = models.DecimalField(max_digits=10, decimal_places=2)

    # 95% paid out to the producer(s) — sum of all OrderProducerGroup.producer_payout values
    producer_payout = models.DecimalField(max_digits=10, decimal_places=2)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )

    # When the customer successfully paid Stripe at checkout
    paid_at = models.DateTimeField(null=True, blank=True)

    # When the producer payout was released — ONLY set when order status → 'delivered'
    # This is what the weekly settlement report (TC-012) is based on
    processed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return (
            f"Payment for Order #{self.order.pk} — "
            f"£{self.amount} — {self.get_status_display()}"
        )


class Dispute(models.Model):
    REASON_CHOICES = [
        ('damaged', 'Damaged'),
        ('missing', 'Missing'),
        ('wrong_item', 'Wrong Item'),
        ('quality', 'Quality'),
        ('other', 'Other'),
    ]

    STATUS_CHOICES = [
        ('open', 'Open'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='dispute')
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='disputes')
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    resolution_note = models.TextField(blank=True, default='')
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_disputes',
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
