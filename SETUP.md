# Campus Carbon Tracker - Setup Guide

## 🎯 Project Overview

A comprehensive DBMS project demonstrating advanced database concepts through a sustainability-focused web application. This project showcases:

- **Database Design**: Normalized 3NF schema with complex relationships
- **Advanced SQL**: JOINs, aggregations, window functions, views, triggers
- **Backend API**: Node.js/Express with authentication and role-based access
- **Frontend**: Modern React application with data visualization
- **Security**: JWT authentication, input validation, SQL injection prevention

## 🛠️ Prerequisites

- **Node.js** (v16 or higher)
- **PostgreSQL** (v12 or higher)
- **Git**
- **Code Editor** (VS Code recommended)

## 📦 Installation Steps

### 1. Database Setup

```bash
# Install PostgreSQL (if not already installed)
# Windows: Download from https://www.postgresql.org/download/windows/
# macOS: brew install postgresql
# Ubuntu: sudo apt-get install postgresql postgresql-contrib

# Start PostgreSQL service
# Windows: Start from Services or pgAdmin
# macOS: brew services start postgresql
# Ubuntu: sudo systemctl start postgresql

# Create database
psql -U postgres
CREATE DATABASE campus_carbon_tracker;
CREATE USER carbon_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE campus_carbon_tracker TO carbon_user;
\q
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env file with your database credentials
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=campus_carbon_tracker
# DB_USER=carbon_user
# DB_PASSWORD=your_password
# JWT_SECRET=your_super_secret_jwt_key

# Run database migrations
psql -U carbon_user -d campus_carbon_tracker -f ../database/schema.sql
psql -U carbon_user -d campus_carbon_tracker -f ../database/sample_data.sql

# Start development server
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create environment file (optional)
echo "VITE_API_URL=http://localhost:5000/api" > .env

# Start development server
npm run dev
```

## 🚀 Running the Application

1. **Start PostgreSQL** service
2. **Start Backend**: `cd backend && npm run dev` (Port 5000)
3. **Start Frontend**: `cd frontend && npm run dev` (Port 3000)
4. **Access Application**: http://localhost:3000

## 👥 Default Users

After running sample data, you can login with:

- **Admin**: admin@university.edu / password123
- **User**: jane.doe@university.edu / password123

## 🗄️ Database Schema Overview

### Core Tables

1. **buildings** - Campus infrastructure
2. **users** - Authentication and user management
3. **energy_consumption** - Scope 1 & 2 emissions data
4. **transportation_log** - Scope 3 user-submitted trips
5. **initiatives** - Carbon reduction projects

### Key DBMS Features Demonstrated

- **Normalization**: 3NF design with proper relationships
- **Constraints**: Primary keys, foreign keys, check constraints
- **Generated Columns**: Automatic CO2e calculations
- **Views**: Pre-built queries for common operations
- **Triggers**: Automatic timestamp updates
- **Indexes**: Performance optimization
- **Complex Queries**: JOINs, aggregations, window functions

## 🎨 Frontend Features

### User Roles & Access

1. **Public/Guest**:
   - Campus overview dashboard
   - Emissions breakdown charts
   - Active initiatives list

2. **Registered Users**:
   - Personal footprint tracker
   - Trip logging
   - Individual vs campus comparison
   - Initiative suggestions

3. **Admin**:
   - Full data management
   - Energy consumption entry
   - Building management
   - Advanced reporting
   - User management

## 📊 Key Features

### Data Visualization
- Interactive charts using Chart.js/Recharts
- Real-time dashboard updates
- Comparative analysis tools
- Trend visualization

### DBMS Demonstrations
- Complex SQL queries visible in reports
- Transaction handling for data integrity
- Role-based access control
- Data validation and constraints

### Security Features
- JWT authentication
- Password hashing with bcrypt
- Input validation and sanitization
- SQL injection prevention
- Rate limiting

## 🔧 Development Commands

### Backend
```bash
npm run dev      # Start development server
npm start        # Start production server
npm run test     # Run tests
```

### Frontend
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

## 📁 Project Structure

```
campus-carbon-tracker/
├── backend/                 # Node.js API server
│   ├── config/             # Database configuration
│   ├── middleware/         # Authentication, validation
│   ├── routes/            # API endpoints
│   └── server.js          # Main server file
├── frontend/              # React application
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── contexts/      # React contexts
│   │   └── services/      # API services
│   └── public/           # Static assets
├── database/             # SQL schemas and queries
│   ├── schema.sql        # Database structure
│   ├── sample_data.sql   # Test data
│   └── complex_queries.sql # DBMS demonstrations
└── docs/                # Documentation
```

## 🎯 DBMS Concepts Showcased

1. **Database Design**:
   - Entity-Relationship modeling
   - Normalization (3NF)
   - Referential integrity

2. **Advanced SQL**:
   - Complex JOINs
   - Aggregate functions
   - Window functions
   - Subqueries
   - Views and triggers

3. **Performance**:
   - Indexing strategies
   - Query optimization
   - Connection pooling

4. **Security**:
   - User authentication
   - Role-based access control
   - Data validation

5. **Transactions**:
   - ACID properties
   - Concurrent access handling
   - Data consistency

## 🚀 Deployment

### Backend Deployment
1. Set production environment variables
2. Use PM2 for process management
3. Configure reverse proxy (nginx)
4. Set up SSL certificates

### Frontend Deployment
1. Build production bundle: `npm run build`
2. Deploy to static hosting (Netlify, Vercel)
3. Configure environment variables

### Database Deployment
1. Use managed PostgreSQL service
2. Configure connection pooling
3. Set up automated backups
4. Monitor performance

## 📈 Future Enhancements

- Real-time data streaming
- Machine learning predictions
- Mobile application
- Advanced analytics
- Integration with IoT sensors
- Automated reporting

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with proper tests
4. Submit pull request

## 📄 License

This project is for educational purposes demonstrating DBMS concepts.

---

**Note**: This is a comprehensive DBMS demonstration project showcasing advanced database concepts in a real-world sustainability application.
