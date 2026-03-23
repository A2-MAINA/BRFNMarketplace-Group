# Use Python 3.13 slim as the base image
FROM python:3.13-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies required for PostgreSQL
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first (for Docker layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy entrypoint script to a path outside /app (so it's not overridden by bind mounts)
COPY entrypoint.sh /docker-entrypoint.sh

# Fix Windows line endings (CRLF) and make the entrypoint script executable
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# Copy the rest of the project code into /app
COPY . .

# Expose port 8000 for the Django development server
EXPOSE 8000

# Entrypoint: wait for DB, run migrations, seed data, create admin, then start server
ENTRYPOINT ["/docker-entrypoint.sh"]