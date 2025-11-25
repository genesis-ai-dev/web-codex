# Codex Web Frontend

A React-based frontend for Codex Web. This application provides a modern, responsive interface for managing development workspaces, groups, and platform administration.

## Features

- **Authentication**: Support for AWS Cognito and Google OAuth
- **Dashboard**: Overview of workspaces and resource usage
- **Workspace Management**: Create, start, stop, and delete Codex workspaces
- **Group Management**: Organize users and workspaces by groups
- **Admin Panel**: Platform administration and user management
- **Responsive Design**: Works seamlessly across desktop and mobile devices
- **Modern UI**: Built with Tailwind CSS and inspired by codex.bible design

## Tech Stack

- **React 18** with TypeScript
- **React Router** for navigation
- **Tailwind CSS** for styling
- **Axios** for API communication
- **AWS Amplify** for Cognito authentication
- **Date-fns** for date formatting

## Quick Start

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

## Configuration

### Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Authentication Provider ('cognito' or 'google')
REACT_APP_AUTH_PROVIDER=cognito

# AWS Cognito (if using Cognito)
REACT_APP_AUTH_CLIENT_ID=your-cognito-client-id
REACT_APP_AUTH_REGION=us-east-1
REACT_APP_USER_POOL_ID=us-east-1_yourpoolid

# Google OAuth (if using Google)
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id.googleusercontent.com

# Backend API
REACT_APP_API_BASE_URL=http://localhost:3001/api
```

## Project Structure

```
src/
├── components/           # React components
│   ├── ui/              # Reusable UI components
│   ├── pages/           # Page components
│   └── Layout.tsx       # Main layout component
├── contexts/            # React contexts
├── services/            # API and authentication services
├── types/               # TypeScript type definitions
├── utils/               # Utility functions
└── index.css           # Global styles and Tailwind imports
```

## UI Components

The application includes a comprehensive set of reusable components:

- **Button**: Multiple variants with loading states and icons
- **Card**: Flexible container with header, content, and footer sections
- **Modal**: Accessible modal dialogs with backdrop and keyboard navigation
- **Input/TextArea/Select**: Form inputs with labels, validation, and help text
- **Badge/StatusBadge**: Status indicators with color variants
- **Progress**: Linear and circular progress indicators for resource usage

## Authentication Flow

1. User clicks login button
2. Redirects to OAuth provider (Cognito/Google)
3. Provider redirects back with authorization code
4. Frontend exchanges code for JWT tokens via backend
5. JWT stored in localStorage for API requests
6. Automatic token refresh on expiration

## Key Features

### Dashboard
- Overview of total workspaces and running instances
- Resource usage visualization with circular progress indicators
- Recent workspace activity
- Quick access to workspace creation

### Workspace Management
- Create workspaces with custom resource allocation
- Start/stop/restart workspace controls
- Real-time status indicators
- Direct access to Codex instances
- Resource usage monitoring

### Responsive Design
- Mobile-first approach with Tailwind CSS
- Collapsible sidebar navigation
- Touch-friendly interface elements
- Optimized for various screen sizes

## Development

### Adding New Pages

1. Create component in `src/components/pages/`
2. Add route in `src/App.tsx`
3. Update navigation in `src/components/Layout.tsx`

### Styling Guidelines

- Use Tailwind utility classes
- Follow the established color palette
- Maintain consistent spacing (8px grid)
- Use semantic component variants

## Deployment

### Production Build

```bash
npm run build
```

### Environment Variables for Production

Set these in your deployment environment:
- `REACT_APP_AUTH_PROVIDER`
- `REACT_APP_AUTH_CLIENT_ID`
- `REACT_APP_AUTH_REGION` (for Cognito)
- `REACT_APP_USER_POOL_ID` (for Cognito)
- `REACT_APP_API_BASE_URL`

## Architecture Notes

### State Management
- React Context for authentication
- Local state for component data
- Props drilling avoided through proper component structure

### Security
- JWT tokens with automatic refresh
- Protected routes with authentication checks
- Input validation on all forms
- CSRF protection headers

### Performance
- Code splitting by routes
- Optimized images and fonts
- Efficient re-render patterns
- Loading states for better UX

## Browser Support

- Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- Mobile browsers (iOS 14+, Android Chrome 90+)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with proper TypeScript types
4. Test thoroughly
5. Submit a pull request

---

This frontend provides a solid foundation for Codex Web with modern React patterns, comprehensive TypeScript support, and a polished user interface ready for production deployment.
