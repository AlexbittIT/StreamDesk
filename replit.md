# StreamStudio Management System

## Overview

StreamStudio is a comprehensive web application for managing a streaming studio. It provides functionality for calendar management, equipment tracking, system monitoring, stream statistics, and user settings. The application is built with a modern tech stack featuring React on the frontend, Express on the backend, and PostgreSQL with Drizzle ORM for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite for development and production builds
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Components**: Radix UI components with shadcn/ui styling system
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful API with WebSocket support for real-time updates
- **Authentication**: Simple session-based authentication (demo implementation)
- **Middleware**: Express middleware for logging, JSON parsing, and error handling

### Data Storage Solutions
- **Database**: PostgreSQL (configured for Neon Database via connection string)
- **ORM**: Drizzle ORM with migrations support
- **Schema Location**: Shared schema definitions in `/shared/schema.ts`
- **Migration Management**: Drizzle Kit for schema management and migrations

## Key Components

### Database Schema
The application uses five main entities:
- **Users**: Authentication and user management with role-based access
- **Events**: Calendar events with scheduling, location, and status tracking
- **Equipment**: Inventory management with status tracking and assignment
- **Systems**: Infrastructure monitoring with health status and specifications
- **Streams**: Live streaming management with platform integration
- **Notifications**: User notification system

### Frontend Components
- **Layout System**: Sidebar navigation with mobile responsiveness
- **Dashboard**: Real-time status cards, activity monitoring, and quick actions
- **Calendar**: Event scheduling and management interface
- **Equipment Management**: Inventory tracking with search and filtering
- **System Monitoring**: Infrastructure health monitoring with real-time updates
- **Stream Statistics**: Platform integration statistics and performance metrics

### Backend Services
- **Storage Interface**: Abstract storage layer with in-memory implementation for development
- **Route Handlers**: RESTful endpoints for all major operations
- **WebSocket Server**: Real-time updates for system status and stream statistics
- **Error Handling**: Centralized error handling with proper HTTP status codes

## Data Flow

### Client-Server Communication
1. **HTTP REST API**: Primary communication method for CRUD operations
2. **WebSocket**: Real-time updates for system monitoring and stream statistics
3. **Query Caching**: TanStack Query provides client-side caching and synchronization
4. **Optimistic Updates**: UI updates immediately with server reconciliation

### Authentication Flow
1. Simple username/password authentication (demo implementation)
2. Client-side session storage in localStorage
3. Auto-login as admin user for demonstration purposes
4. Role-based access control ready for implementation

### Real-time Updates
1. WebSocket connection established on dashboard load
2. Server pushes updates for system status, stream statistics, and platform data
3. Client automatically updates cached queries based on WebSocket messages
4. Automatic reconnection handling for network interruptions

## External Dependencies

### UI and Component Libraries
- **Radix UI**: Accessible, unstyled UI primitives
- **Lucide React**: Icon library for consistent iconography
- **React Icons**: Additional icons for platform-specific branding
- **Tailwind CSS**: Utility-first CSS framework
- **class-variance-authority**: Component variant management

### Development and Build Tools
- **Vite**: Fast development server and build tool
- **TypeScript**: Type safety and development experience
- **ESBuild**: Fast bundling for production builds
- **PostCSS**: CSS processing with Tailwind integration

### Backend Dependencies
- **Express**: Web application framework
- **WebSocket (ws)**: Real-time communication
- **Drizzle ORM**: Type-safe database operations
- **Neon Database**: Serverless PostgreSQL integration
- **Date-fns**: Date manipulation and formatting

## Deployment Strategy

### Development Environment
- **Hot Module Replacement**: Vite provides fast development with HMR
- **Development Server**: Express server with Vite middleware integration
- **Database**: PostgreSQL connection via DATABASE_URL environment variable
- **Real-time Features**: WebSocket server integrated with HTTP server

### Production Build
- **Frontend Build**: Vite builds optimized static assets to `dist/public`
- **Backend Build**: ESBuild bundles server code to `dist/index.js`
- **Static File Serving**: Express serves built frontend assets in production
- **Environment Configuration**: Production settings via NODE_ENV variable

### Database Management
- **Schema Migrations**: Drizzle Kit manages database schema changes
- **Environment Variables**: DATABASE_URL required for database connection
- **Connection Pooling**: Neon serverless database handles connection management
- **Development Data**: In-memory storage for development and testing

The application is designed for easy deployment on platforms like Replit, with automatic database provisioning and environment configuration. The modular architecture allows for easy extension and maintenance while providing a solid foundation for streaming studio management operations.

## Recent Changes: Latest modifications with dates

### January 25, 2025 - Complete Forms and CRUD Implementation
- ✓ Created fully functional equipment management with photo uploads, specifications, and inventory tracking
- ✓ Implemented event creation forms with participant selection and custom location support  
- ✓ Built system management forms with real-time IP status checking capabilities
- ✓ Added comprehensive API routes with full CRUD operations for all entities
- ✓ Integrated PostgreSQL database with enhanced schema for multi-user functionality
- ✓ Created functional pages for Equipment, Servers, and Calendar with filtering and search
- ✓ Resolved database migration issues and updated schema structure
- ✓ All buttons and forms are now fully functional with working CRUD operations