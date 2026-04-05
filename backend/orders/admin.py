from django.contrib import admin
from django.utils.html import format_html
from .models import Order, OrderProducerGroup, OrderItem, OrderStatusHistory, Payment, Dispute


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = (
        'product', 'producer', 'quantity',
        'price_at_time_of_order', 'unit_at_time_of_order',
        'product_name_at_time_of_order', 'get_item_total'
    )

    def get_item_total(self, obj):
        return f"£{obj.get_item_total()}"
    get_item_total.short_description = 'Line Total'


class OrderProducerGroupInline(admin.TabularInline):
    model = OrderProducerGroup
    extra = 0
    readonly_fields = (
        'producer', 'fulfilment_type', 'delivery_fee',
        'subtotal', 'commission', 'producer_payout', 'pickup_location'
    )


class OrderStatusHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    readonly_fields = ('status', 'changed_by', 'note', 'changed_at')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'invoice_number', 'customer_email',
        'status_badge', 'total_amount', 'delivery_date', 'created_at'
    )
    list_filter = ('status', 'delivery_date', 'created_at')
    search_fields = (
        'customer__email', 'invoice_number',
        'delivery_address', 'delivery_postcode'
    )
    readonly_fields = (
        'invoice_number', 'cancellation_deadline',
        'created_at', 'updated_at', 'total_amount', 'total_delivery_fee'
    )
    inlines = [OrderProducerGroupInline, OrderStatusHistoryInline]
    ordering = ('-created_at',)

    def customer_email(self, obj):
        return obj.customer.email
    customer_email.short_description = 'Customer'

    def status_badge(self, obj):
        colours = {
            'pending':    '#f59e0b',
            'confirmed':  '#3b82f6',
            'processing': '#8b5cf6',
            'ready':      '#06b6d4',
            'delivered':  '#10b981',
            'cancelled':  '#6b7280',
            'rejected':   '#ef4444',
        }
        colour = colours.get(obj.status, '#6b7280')
        return format_html(
            '<span style="background:{}; color:white; padding:3px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            colour, obj.get_status_display()
        )
    status_badge.short_description = 'Status'


@admin.register(OrderProducerGroup)
class OrderProducerGroupAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'order_id', 'producer_name', 'fulfilment_type',
        'subtotal', 'commission', 'producer_payout', 'delivery_fee'
    )
    list_filter = ('fulfilment_type',)
    search_fields = ('order__invoice_number', 'producer__email')
    readonly_fields = ('subtotal', 'commission', 'producer_payout', 'delivery_fee')
    inlines = [OrderItemInline]

    def producer_name(self, obj):
        try:
            return obj.producer.producer_profile.business_name
        except Exception:
            return obj.producer.email
    producer_name.short_description = 'Producer'


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'order_id', 'product_name_at_time_of_order',
        'quantity', 'unit_at_time_of_order',
        'price_at_time_of_order', 'line_total'
    )
    search_fields = ('order__invoice_number', 'product_name_at_time_of_order')
    readonly_fields = (
        'order', 'producer_group', 'product', 'producer',
        'price_at_time_of_order', 'unit_at_time_of_order',
        'product_name_at_time_of_order'
    )

    def line_total(self, obj):
        return f"£{obj.get_item_total()}"
    line_total.short_description = 'Line Total'


@admin.register(OrderStatusHistory)
class OrderStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'order_id', 'status', 'changed_by', 'note', 'changed_at')
    list_filter = ('status', 'changed_at')
    search_fields = ('order__invoice_number', 'changed_by__email')
    readonly_fields = ('order', 'status', 'changed_by', 'changed_at')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'order_id', 'amount', 'commission',
        'producer_payout', 'status_badge', 'paid_at', 'processed_at'
    )
    list_filter = ('status', 'paid_at', 'processed_at')
    search_fields = ('order__invoice_number', 'transaction_id')
    readonly_fields = (
        'order', 'amount', 'commission', 'producer_payout',
        'transaction_id', 'paid_at', 'processed_at', 'created_at'
    )

    def status_badge(self, obj):
        colours = {
            'pending':   '#f59e0b',
            'processed': '#10b981',
            'failed':    '#ef4444',
            'refunded':  '#6b7280',
        }
        colour = colours.get(obj.status, '#6b7280')
        return format_html(
            '<span style="background:{}; color:white; padding:3px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            colour, obj.get_status_display()
        )
    status_badge.short_description = 'Status'

@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'order_invoice', 'raised_by_email',
        'reason_badge', 'status_badge', 'created_at', 'resolved_at'
    )
    list_filter = ('status', 'reason', 'created_at')
    search_fields = ('order__invoice_number', 'raised_by__email', 'description')
    readonly_fields = ('order', 'raised_by', 'created_at')

    def order_invoice(self, obj):
        return obj.order.invoice_number
    order_invoice.short_description = 'Order'

    def raised_by_email(self, obj):
        return obj.raised_by.email
    raised_by_email.short_description = 'Raised By'

    def reason_badge(self, obj):
        colours = {
            'damaged':    '#ef4444',
            'missing':    '#f59e0b',
            'wrong_item': '#8b5cf6',
            'quality':    '#3b82f6',
            'other':      '#6b7280',
        }
        colour = colours.get(obj.reason, '#6b7280')
        return format_html(
            '<span style="background:{}; color:white; padding:3px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            colour, obj.get_reason_display()
        )
    reason_badge.short_description = 'Reason'

    def status_badge(self, obj):
        colours = {
            'open':         '#f59e0b',
            'under_review': '#3b82f6',
            'resolved':     '#10b981',
            'closed':       '#6b7280',
        }
        colour = colours.get(obj.status, '#6b7280')
        return format_html(
            '<span style="background:{}; color:white; padding:3px 8px; '
            'border-radius:4px; font-size:11px;">{}</span>',
            colour, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
