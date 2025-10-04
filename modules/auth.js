const { APP_CONFIG } = require('./config');

// Check if user is authenticated
function requireAuth(req, res, next) {
    // Skip auth for login endpoint, config, and static files
    if (req.path === '/login' || req.path.startsWith('/api/login') || req.path.startsWith('/api/auth/login') || req.path.startsWith('/api/config') || req.path.startsWith('/static/')) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
        const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('ascii');
        const [username, password] = credentials.split(':');

        if (password === APP_CONFIG.password) {
            return next();
        }
    }

    // Check for session-based auth
    if (req.session && req.session.authenticated) {
        return next();
    }

    // If it's an API request, return 401
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
    } else {
        return res.redirect('/login');
    }
}

// Login page HTML
function getLoginPageHTML(error = null) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="description" content="Login to access the Video Player">
            <meta name="theme-color" content="#000000">
            <title>Login - ${APP_CONFIG.name}</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
            <style>
                body {
                    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
                    color: #ffffff;
                    font-family: 'Inter', sans-serif;
                }
                .login-container { 
                    min-height: 100vh; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                }
                .login-card { 
                    background: rgba(33, 37, 41, 0.95); 
                    backdrop-filter: blur(10px); 
                    border-radius: 1rem; 
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                    border: 1px solid #495057;
                }
                .login-header { 
                    background: linear-gradient(135deg, #B91C1C 0%, #DC2626 100%); 
                    color: white; 
                    border-radius: 1rem 1rem 0 0; 
                    padding: 2rem;
                }
                /* Login-specific styles - main styles come from style-bootstrap.css */
                .login-card {
                    background: rgba(33, 37, 41, 0.95) !important;
                }
                .form-control:focus {
                    border-color: #B91C1C;
                    box-shadow: 0 0 0 0.2rem rgba(185, 28, 28, 0.25);
                }
                .btn-primary {
                    background: linear-gradient(135deg, #B91C1C 0%, #DC2626 100%);
                    border: none;
                    transition: all 0.3s ease;
                }
                .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(185, 28, 28, 0.4);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="row justify-content-center">
                    <div class="col-md-6 col-lg-4">
                        <div class="card login-card mt-5">
                            <div class="card-header login-header text-center py-4">
                                <h3 class="mb-0"><i class="fas fa-lock me-2"></i>Access Required</h3>
                                <p class="mb-0 mt-2">Enter password to continue</p>
                            </div>
                            <div class="card-body p-4">
                                <form method="POST" action="/api/login">
                                    <div class="mb-3">
                                        <label for="password" class="form-label">
                                            <i class="fas fa-key me-2"></i>Password
                                        </label>
                                        <input type="password" 
                                               class="form-control bg-dark" 
                                               id="password" 
                                               name="password" 
                                               placeholder="Enter your password..."
                                               required 
                                               autofocus>
                                    </div>
                                    <button type="submit" class="btn btn-primary w-100">
                                        <i class="fas fa-sign-in-alt me-2"></i>Login
                                    </button>
                                </form>
                                ${error ? '<div class="alert alert-danger mt-3"><i class="fas fa-exclamation-triangle me-2"></i>Invalid password</div>' : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

module.exports = {
    requireAuth,
    getLoginPageHTML
};
