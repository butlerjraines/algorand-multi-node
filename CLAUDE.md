# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure
The project follows a modular structure:
- `/src`: Main application source code
  - `/config`: Configuration files and constants
  - `/controllers`: Business logic handlers
  - `/middleware`: Express middleware
  - `/models`: Database models
  - `/routes`: API route definitions
  - `/services`: Service layer for business logic
  - `/utils`: Utility functions
  - `/public`: Frontend assets
    - `/css`: Stylesheets
    - `/js`: JavaScript modules
    - `/temp`: Temporary files for exports

## Build Commands
- Start server: `npm start`
- Start development with auto-reload: `npm run dev`

## Dependencies
- Express.js for the backend API
- MongoDB for data storage
- AlgoSDK for Algorand blockchain interaction
- Bootstrap for the frontend UI
- Axios for HTTP requests

## Code Style Guidelines
- **Imports**: Group related imports together. Node.js built-ins first, then external packages, then local modules.
- **Formatting**: Use 4-space indentation, consistent semicolons, and single quotes for strings.
- **Naming**: Use camelCase for variables and functions, PascalCase for classes.
- **Error Handling**: Always use try/catch blocks for database operations and API endpoints.
- **Database**: Use the `connectToDatabase()` helper function for MongoDB connections.
- **Frontend**: Modular JavaScript with Bootstrap for styling.
- **Comments**: Use descriptive comments for functions and complex logic sections.