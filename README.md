# Campus Carbon Tracker

A comprehensive web platform to track, visualize, and help reduce university carbon footprint with advanced DBMS features.

## 🎯 Project Overview

**Objective**: Design and build a secure, interactive web platform demonstrating core Database Management System (DBMS) concepts while tracking university carbon emissions.

**Target Users**: 
- University Administration (Admin)
- Students/Staff (Registered Users)
- General Public (Guests)

## 🏗️ Architecture

### Technology Stack
- **Frontend**: React.js with TailwindCSS and shadcn/ui components
- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL
- **Visualization**: Chart.js/Recharts
- **Authentication**: JWT with role-based access control

### Project Structure
```
campus-carbon-tracker/
├── backend/          # Node.js API server
├── frontend/         # React.js application
├── database/         # SQL schemas and migrations
├── docs/            # Documentation
└── README.md
```

## 🗄️ Database Schema

The system implements a normalized relational database (3NF) with the following entities:

### Core Tables
- **Buildings**: Campus infrastructure data
- **Energy_Consumption**: Scope 1 & 2 emissions data
- **Transportation_Log**: Scope 3 user-submitted trip data
- **Users**: Authentication and role management
- **Initiatives**: Carbon reduction projects

### DBMS Concepts Demonstrated
- ✅ Normalization (3NF)
- ✅ Primary/Foreign Key Relationships
- ✅ Complex JOIN operations
- ✅ Aggregate functions (SUM, AVG, COUNT)
- ✅ Role-based access control
- ✅ Data integrity constraints
- ✅ Indexing for performance

## 🚀 Features by User Role

### 🌍 Public/Guest View
- Campus overview dashboard
- Total annual CO2e emissions
- Emissions breakdown by scope (Pie chart)
- Active carbon reduction initiatives

### 👤 Registered User View
- Personal footprint tracker
- Trip logging form
- Individual dashboard with personal vs campus average comparison
- Initiative suggestion form

### 🔧 Admin View
- Full data dashboard with pagination
- Data entry forms for energy consumption
- Initiative management (CRUD operations)
- Advanced reporting with complex SQL queries
- Top 5 carbon-intensive buildings report

## 🎨 Design Theme

Clean, modern interface with dark green/blue sustainability palette featuring:
- Interactive data visualizations
- Responsive mobile-friendly design
- Accessibility-first approach
- Professional data-focused UI

## 🛠️ Setup Instructions

1. **Clone and Setup**
   ```bash
   cd campus-carbon-tracker
   ```

2. **Database Setup**
   ```bash
   cd database
   # Follow database setup instructions
   ```

3. **Backend Setup**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

4. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm start
   ```

## 📊 Key Metrics Tracked

- **Scope 1**: Direct emissions (on-campus fuel combustion)
- **Scope 2**: Indirect emissions (purchased electricity)
- **Scope 3**: Other indirect emissions (transportation, commuting)

## 🔒 Security Features

- JWT-based authentication
- Role-based access control (RBAC)
- Input validation and sanitization
- SQL injection prevention
- Password hashing with bcrypt

## 📈 Data Visualization

- Real-time carbon footprint dashboards
- Interactive charts and graphs
- Comparative analysis tools
- Trend analysis over time
- Building-wise consumption breakdown

---

**Note**: This project is designed as a comprehensive DBMS demonstration, showcasing advanced database concepts in a real-world sustainability application.
