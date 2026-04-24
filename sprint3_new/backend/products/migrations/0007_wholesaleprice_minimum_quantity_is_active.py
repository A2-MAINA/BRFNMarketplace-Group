from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0006_sprint3_models'),
    ]

    operations = [
        migrations.AddField(
            model_name='wholesaleprice',
            name='minimum_quantity',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='wholesaleprice',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]

