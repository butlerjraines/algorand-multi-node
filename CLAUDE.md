# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- Start server: `node server.js`
- Start development: `nodemon server.js` (if nodemon is installed)

## Dependencies
- Express.js for the backend API
- MongoDB for data storage
- AlgoSDK for Algorand blockchain interaction
- Bootstrap for the frontend UI

## Code Style Guidelines
- **Imports**: Group related imports together. Node.js built-ins first, then external packages, then local modules.
- **Formatting**: Use 4-space indentation, consistent semicolons, and single quotes for strings.
- **Naming**: Use camelCase for variables and functions, PascalCase for classes.
- **Error Handling**: Always use try/catch blocks for database operations and API endpoints.
- **Database**: Use the `connectToDatabase()` helper function for MongoDB connections.
- **Frontend**: Vanilla JavaScript with Bootstrap for styling, no frontend framework.
- **Comments**: Use descriptive comments for functions and complex logic sections.