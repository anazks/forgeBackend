# Forge ERP API Documentation

**Base URL**: `http://localhost:5000/api`

## Authentication
Most routes require a Bearer Token. Include it in the header:
`Authorization: Bearer <your_jwt_token>`

---

## User Endpoints (`/users`)

### 1. Create User (By Role - Super Admin Only)
*   **URL**: `/users`
*   **Method**: `POST`
*   **Access**: Private/SuperAdmin
*   **Body**:
    ```json
    {
      "name": "User Name",
      "email": "user@example.com",
      "password": "password123",
      "role": "CENTERS", 
      "mobileNo": "1234567890",
      "area": "Zone A",
      "entityId": "optional_entity_id_here",
      "duration": 12 
    }
    ```
    *Note: `duration` is only required if `role` is `ADMIN`.*

### 2. Register User (Public)

### 3. Login User
*   **URL**: `/users/login`
*   **Method**: `POST`
*   **Access**: Public
*   **Body**:
    ```json
    {
      "email": "user@example.com",
      "password": "password123"
    }
    ```

### 4. Create Admin (Deprecated - Use #1)
*   **URL**: `/users/create-admin`
*   **Method**: `POST`
*   **Access**: Private/SuperAdmin

### 5. Toggle User Status (Super Admin Only)
*   **URL**: `/users/:id/toggle-status`
*   **Method**: `PUT`
*   **Access**: Private/SuperAdmin

### 6. Update User (Super Admin Only)
*   **URL**: `/users/:id`
*   **Method**: `PUT`
*   **Access**: Private/SuperAdmin
*   **Body**: Any field you want to update (e.g., `name`, `mobileNo`, `area`).

### 7. Delete User (Super Admin Only)
*   **URL**: `/users/:id`
*   **Method**: `DELETE`
*   **Access**: Private/SuperAdmin
*   **Note**: If the user is an admin linked to an Entity, they will be removed from the Entity's list automatically.

---

## Entity Endpoints (`/entities`)

### 1. Get All Entities
*   **URL**: `/entities`
*   **Method**: `GET`
*   **Access**: Private/SuperAdmin

### 2. Get Admins by Entity
*   **URL**: `/entities/:id/admins`
*   **Method**: `GET`
*   **Access**: Private/SuperAdmin

### 3. Create Entity (Simple)
*   **URL**: `/entities`
*   **Method**: `POST`
*   **Access**: Private/SuperAdmin
*   **Body**:
    ```json
    {
      "username": "brand_name_or_code",
      "name": "Full Business Name",
      "location": "City Name"
    }
    ```

### 4. Create Entity with First Admin
*   **URL**: `/entities/create-with-admin`
*   **Method**: `POST`
*   **Access**: Private/SuperAdmin
*   **Body**:
    ```json
    {
      "entityUsername": "brand_name_or_code",
      "entityName": "Full Business Name",
      "location": "City Name",
      "name": "First Admin Name",
      "email": "firstadmin@example.com",
      "password": "password123",
      "mobileNo": "9876543210",
      "area": "South Zone",
      "duration": 12
    }
    ```

### 5. Add Another Admin to Entity
*   **URL**: `/entities/:id/add-admin`
*   **Method**: `POST`
*   **Access**: Private/SuperAdmin
*   **Body**:
    ```json
    {
      "name": "Second Admin Name",
      "email": "secondadmin@example.com",
      "password": "password123",
      "mobileNo": "9876543211",
      "area": "North Zone",
      "duration": 6
    }
    ```

---

## Payment Endpoints (`/payments`)

### 1. Get All Payments
*   **URL**: `/payments`
*   **Method**: `GET`
*   **Access**: Private/SuperAdmin

### 2. Create Payment
*   **URL**: `/payments`
*   **Method**: `POST`
*   **Access**: Private (SuperAdmin or Admin)
*   **Body**:
    ```json
    {
      "amount": 500,
      "description": "Subscription Renewal"
    }
    ```

### 3. Confirm Payment
*   **URL**: `/payments/:id/confirm`
*   **Method**: `PUT`
*   **Access**: Private/SuperAdmin
