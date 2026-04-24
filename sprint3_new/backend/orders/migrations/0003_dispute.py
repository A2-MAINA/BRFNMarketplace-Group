from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0002_add_status_to_producergroup'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Dispute',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reason', models.CharField(choices=[('damaged', 'Damaged'), ('missing', 'Missing'), ('wrong_item', 'Wrong Item'), ('quality', 'Quality'), ('other', 'Other')], max_length=20)),
                ('description', models.TextField()),
                ('status', models.CharField(choices=[('open', 'Open'), ('resolved', 'Resolved'), ('closed', 'Closed')], default='open', max_length=20)),
                ('resolution_note', models.TextField(blank=True, default='')),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('customer', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='disputes', to=settings.AUTH_USER_MODEL)),
                ('order', models.OneToOneField(on_delete=models.deletion.CASCADE, related_name='dispute', to='orders.order')),
                ('resolved_by', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name='resolved_disputes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
