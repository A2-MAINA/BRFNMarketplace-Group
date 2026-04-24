from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
import datetime
from .models import Order, OrderProducerGroup, OrderItem, OrderStatusHistory, Payment, Dispute
from products.models import Product

User = get_user_model()


# ============================
# Nested Producer Info
# ============================

class ProducerSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(source='pk')
    email = serializers.EmailField()
    business_name = serializers.SerializerMethodField()

    # Returns a producer business name when a producer profile exists.
    def get_business_name(self, obj):
        try:
            return obj.producer_profile.business_name
        except Exception:
            return obj.email


# ============================
# OrderItem Serializer
# ============================

class OrderItemSerializer(serializers.ModelSerializer):
    item_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            'id',
            'product',
            'producer',
            'quantity',
            'price_at_time_of_order',
            'unit_at_time_of_order',
            'product_name_at_time_of_order',
            'item_total',
            'added_at',
        ]
        read_only_fields = fields

    # Exposes the calculated line total for an order item.
    def get_item_total(self, obj):
        return obj.get_item_total()


# ============================
# OrderStatusHistory Serializer
# ============================

class OrderStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_email = serializers.SerializerMethodField()

    class Meta:
        model = OrderStatusHistory
        fields = ['id', 'status', 'changed_by', 'changed_by_email', 'note', 'changed_at']
        read_only_fields = fields

    # Returns the email of the user who made the status change when available.
    def get_changed_by_email(self, obj):
        if obj.changed_by:
            return obj.changed_by.email
        return None


# ============================
# OrderProducerGroup Serializer
# ============================

class OrderProducerGroupSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    producer_info = serializers.SerializerMethodField()

    class Meta:
        model = OrderProducerGroup
        fields = [
            'id',
            'producer',
            'producer_info',
            'status',
            'fulfilment_type',
            'delivery_fee',
            'pickup_location',
            'delivery_date',
            'subtotal',
            'commission',
            'producer_payout',
            'items',
            'created_at',
        ]
        read_only_fields = fields

    # Builds a compact nested producer object for group responses.
    def get_producer_info(self, obj):
        try:
            return {
                'id': obj.producer.pk,
                'email': obj.producer.email,
                'business_name': obj.producer.producer_profile.business_name,
            }
        except Exception:
            return {'id': obj.producer.pk, 'email': obj.producer.email}


# ============================
# Order Read Serializer (GET)
# ============================

class OrderSerializer(serializers.ModelSerializer):
    producer_groups = OrderProducerGroupSerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)
    customer_email = serializers.EmailField(source='customer.email', read_only=True)
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id',
            'invoice_number',
            'customer',
            'customer_email',
            'status',
            'delivery_date',
            'delivery_address',
            'delivery_postcode',
            'special_instructions',
            'total_amount',
            'total_delivery_fee',
            'stripe_payment_intent_id',
            'cancellation_deadline',
            'can_cancel',
            'producer_groups',
            'status_history',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    # Indicates whether the order can still be cancelled by the customer.
    def get_can_cancel(self, obj):
        return obj.can_be_cancelled()


# ============================
# Order Create Serializer (POST /api/orders/)
# ============================

class OrderItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class OrderProducerGroupInputSerializer(serializers.Serializer):
    producer_id = serializers.IntegerField()
    fulfilment_type = serializers.ChoiceField(choices=['standard', 'express', 'pickup'])
    delivery_date = serializers.DateField()
    items = OrderItemInputSerializer(many=True)

    # Enforces the minimum lead time for each producer-group delivery date.
    def validate_delivery_date(self, value):
        # Minimum 48 hours from today — TC-007, TC-008
        min_date = datetime.date.today() + datetime.timedelta(days=2)
        if value < min_date:
            raise serializers.ValidationError(
                'Delivery date must be at least 48 hours from now.'
            )
        return value


class OrderCreateSerializer(serializers.Serializer):
    delivery_address = serializers.CharField(required=False, allow_blank=True)
    delivery_postcode = serializers.CharField(max_length=10, required=False, allow_blank=True)
    special_instructions = serializers.CharField(required=False, allow_blank=True)
    producer_groups = OrderProducerGroupInputSerializer(many=True)

    # Makes sure the request contains at least one producer group.
    def validate_producer_groups(self, value):
        if not value:
            raise serializers.ValidationError('At least one producer group is required.')
        return value

    # Requires an address whenever any producer group uses delivery instead of pickup.
    def validate(self, data):
        # Check all groups are pickup — if not, delivery address is required
        groups = data.get('producer_groups', [])
        all_pickup = all(g['fulfilment_type'] == 'pickup' for g in groups)
        if not all_pickup:
            if not data.get('delivery_address'):
                raise serializers.ValidationError(
                    {'delivery_address': 'Delivery address is required for non-pickup orders.'}
                )
            if not data.get('delivery_postcode'):
                raise serializers.ValidationError(
                    {'delivery_postcode': 'Delivery postcode is required for non-pickup orders.'}
                )
        return data

    @transaction.atomic
    # Creates the full order, its producer groups, items, payment, and initial history.
    def create(self, validated_data):
        customer = self.context['request'].user
        groups_data = validated_data.pop('producer_groups')

        # Step 1 — validate stock before creating anything
        for group_data in groups_data:
            for item_data in group_data['items']:
                try:
                    product = Product.objects.get(pk=item_data['product_id'])
                except Product.DoesNotExist:
                    raise serializers.ValidationError(
                        f"Product {item_data['product_id']} does not exist."
                    )
                if product.stock_quantity < item_data['quantity']:
                    raise serializers.ValidationError(
                        f"Insufficient stock for {product.name}. "
                        f"Available: {product.stock_quantity}, Requested: {item_data['quantity']}."
                    )

        # Step 2 — create Order
        order = Order.objects.create(
            customer=customer,
            delivery_date=groups_data[0]['delivery_date'],
            delivery_address=validated_data.get('delivery_address', ''),
            delivery_postcode=validated_data.get('delivery_postcode', ''),
            special_instructions=validated_data.get('special_instructions', ''),
        )

        # Step 3 — create OrderProducerGroup + OrderItem for each producer
        for group_data in groups_data:
            try:
                producer = User.objects.get(pk=group_data['producer_id'], role='producer')
            except User.DoesNotExist:
                raise serializers.ValidationError(
                    f"Producer {group_data['producer_id']} does not exist."
                )

            fulfilment_type = group_data['fulfilment_type']
            pickup_location = ''
            if fulfilment_type == 'pickup':
                try:
                    pickup_location = producer.producer_profile.address
                except Exception:
                    pickup_location = ''

            group = OrderProducerGroup.objects.create(
                order=order,
                producer=producer,
                fulfilment_type=fulfilment_type,
                pickup_location=pickup_location,
                delivery_date=group_data['delivery_date'],
            )

            for item_data in group_data['items']:
                product = Product.objects.get(pk=item_data['product_id'])

                OrderItem.objects.create(
                    order=order,
                    producer_group=group,
                    product=product,
                    producer=producer,
                    quantity=item_data['quantity'],
                    price_at_time_of_order=product.price,
                    unit_at_time_of_order=product.unit,
                    product_name_at_time_of_order=product.name,
                )

                # Decrement stock
                product.stock_quantity -= item_data['quantity']
                product.save(update_fields=['stock_quantity'])

            # Step 4 — calculate financials per group
            group.calculate_financials()

        # Step 5 — calculate order totals
        order.calculate_totals()

        # Step 6 — create Payment record
        total_commission = sum(g.commission for g in order.producer_groups.all())
        total_payout = sum(g.producer_payout for g in order.producer_groups.all())
        Payment.objects.create(
            order=order,
            amount=order.total_amount,
            commission=total_commission,
            producer_payout=total_payout,
            status='pending',
        )

        # Step 7 — create initial status history
        OrderStatusHistory.objects.create(
            order=order,
            status='pending',
            changed_by=customer,
            note='Order placed by customer.',
        )

        return order


# ============================
# Order Status Update Serializer (TC-010)
# ============================

GROUP_VALID_TRANSITIONS = {
    'pending':    ['confirmed', 'rejected'],
    'confirmed':  ['processing'],
    'processing': ['ready'],
    'ready':      ['delivered'],
}


# Derives the parent order status from the statuses of all producer groups.
def derive_order_status(order):
    """
    Auto-derive the parent Order status from all its producer group statuses.
    Rules:
    - If ALL groups are delivered → order is delivered
    - If ALL groups are rejected → order is rejected
    - If ANY group is rejected and the rest are delivered → order is delivered
    - Otherwise use the least-progressed non-rejected group status
    """
    statuses = list(order.producer_groups.values_list('status', flat=True))
    if not statuses:
        return order.status

    non_rejected = [s for s in statuses if s != 'rejected']

    # All rejected
    if not non_rejected:
        return 'rejected'

    # All non-rejected are delivered
    if all(s == 'delivered' for s in non_rejected):
        return 'delivered'

    # Use least-progressed non-rejected status
    progress = ['pending', 'confirmed', 'processing', 'ready', 'delivered']
    for p in progress:
        if p in non_rejected:
            return p

    return order.status


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.CharField()
    note = serializers.CharField(required=False, allow_blank=True)

    # Validates that the next group status is one of the allowed forward transitions.
    def validate_status(self, value):
        group = self.context['group']
        allowed = GROUP_VALID_TRANSITIONS.get(group.status, [])
        if value not in allowed:
            raise serializers.ValidationError(
                f"Cannot transition from '{group.status}' to '{value}'. "
                f"Allowed: {allowed}"
            )
        return value

    # Updates the producer group, syncs the parent order status, and logs the change.
    def update(self, order, validated_data):
        new_status = validated_data['status']
        note = validated_data.get('note', '')
        user = self.context['request'].user
        group = self.context['group']

        # Update the producer group status
        group.status = new_status
        group.save(update_fields=['status'])

        # Auto-derive parent order status
        order.status = derive_order_status(order)
        order.save(update_fields=['status'])

        # Always create history record on every status change
        OrderStatusHistory.objects.create(
            order=order,
            status=new_status,
            changed_by=user,
            note=note,
        )

        # Trigger payment release when ALL non-rejected groups are delivered
        if order.status == 'delivered':
            try:
                payment = order.payment
                if payment.status != 'processed':
                    payment.status = 'processed'
                    payment.processed_at = timezone.now()
                    payment.save(update_fields=['status', 'processed_at'])
            except Payment.DoesNotExist:
                pass

        return order


# ============================
# Settlement Serializer (TC-012)
# ============================

class SettlementOrderSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='order.invoice_number')
    delivery_date = serializers.DateField(source='order.delivery_date')
    customer_name = serializers.SerializerMethodField()
    items_sold = serializers.SerializerMethodField()

    class Meta:
        model = OrderProducerGroup
        fields = [
            'invoice_number',
            'delivery_date',
            'customer_name',
            'items_sold',
            'subtotal',
            'commission',
            'producer_payout',
            'delivery_fee',
        ]

    # Returns the customer's name in anonymised form for settlement reporting.
    def get_customer_name(self, obj):
        try:
            profile = obj.order.customer.customer_profile
            name = profile.full_name
            parts = name.split()
            if len(parts) >= 2:
                return f"{parts[0]} {parts[-1][0]}."
            return name
        except Exception:
            return obj.order.customer.email

    # Counts how many order items belong to this producer-group settlement row.
    def get_items_sold(self, obj):
        try:
            return obj.items.count()
        except Exception:
            return 0


class SettlementSerializer(serializers.Serializer):
    week_start = serializers.DateField()
    week_end = serializers.DateField()
    total_orders = serializers.IntegerField()
    gross_sales = serializers.DecimalField(max_digits=10, decimal_places=2)
    commission = serializers.DecimalField(max_digits=10, decimal_places=2)
    net_payout = serializers.DecimalField(max_digits=10, decimal_places=2)
    orders = SettlementOrderSerializer(many=True)


# ============================
# Payment Serializer
# ============================

class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            'id', 'order', 'transaction_id', 'amount',
            'commission', 'producer_payout', 'status',
            'paid_at', 'processed_at', 'created_at',
        ]
        read_only_fields = fields


class DisputeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dispute
        fields = ['reason', 'description']


class DisputeReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dispute
        fields = ['id', 'reason', 'description', 'status', 'resolution_note', 'resolved_at', 'created_at']
        read_only_fields = fields


class DisputeResolveSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(choices=[('resolved', 'resolved'), ('closed', 'closed')])
    resolution_note = serializers.CharField(allow_blank=False)

    class Meta:
        model = Dispute
        fields = ['status', 'resolution_note']

    # Stores the admin's resolution decision and timestamps the action.
    def update(self, instance, validated_data):
        request = self.context['request']
        instance.status = validated_data['status']
        instance.resolution_note = validated_data['resolution_note']
        instance.resolved_by = request.user
        instance.resolved_at = timezone.now()
        instance.save(update_fields=['status', 'resolution_note', 'resolved_by', 'resolved_at'])
        return instance
