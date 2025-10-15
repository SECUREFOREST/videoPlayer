const { APP_CONFIG } = require('./config');

// Check if user is authenticated
function requireAuth(req, res, next) {
    // Skip auth for login endpoint, config, and static files
	if (req.path === '/login' || req.path.startsWith('/api/login') || req.path.startsWith('/api/auth/login') || req.path.startsWith('/api/config') || req.path.startsWith('/static/') || req.path.startsWith('/thumbnails/')) {
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
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                * {
                    box-sizing: border-box;
                }
                body {
                    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
                    color: #ffffff;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 0;
                    padding: 0;
                    min-height: 100vh;
                }
                .login-container { 
                    min-height: 100vh; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    padding: 1rem;
                }
                .login-card { 
                    background: rgba(33, 37, 41, 0.95); 
                    backdrop-filter: blur(10px); 
                    border-radius: 1rem; 
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                    border: 1px solid #495057;
                    width: 100%;
                    max-width: 400px;
                }
                .login-header { 
                    background: linear-gradient(135deg, #B91C1C 0%, #DC2626 100%); 
                    color: white; 
                    border-radius: 1rem 1rem 0 0; 
                    padding: 2rem;
                    text-align: center;
                }
                .login-header h3 {
                    margin: 0;
                    font-weight: 600;
                }
                .login-header p {
                    margin: 0.5rem 0 0 0;
                    opacity: 0.9;
                }
                .card-body {
                    padding: 2rem;
                }
                .form-control {
                    background-color: #212529 !important;
                    border: 1px solid #495057 !important;
                    color: #ffffff !important;
                    border-radius: 0.5rem;
                    padding: 0.75rem 1rem;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                }
                .form-control:focus {
                    border-color: #B91C1C !important;
                    box-shadow: 0 0 0 0.2rem rgba(185, 28, 28, 0.25) !important;
                    background-color: #212529 !important;
                    outline: none;
                }
                .form-control::placeholder {
                    color: #6c757d !important;
                }
                .btn-primary {
                    background: linear-gradient(135deg, #B91C1C 0%, #DC2626 100%) !important;
                    border: none !important;
                    border-radius: 0.5rem;
                    padding: 0.75rem 1rem;
                    font-weight: 500;
                    transition: all 0.3s ease;
                }
                .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(185, 28, 28, 0.4);
                    background: linear-gradient(135deg, #DC2626 0%, #B91C1C 100%) !important;
                }
                .btn-primary:active {
                    transform: translateY(0);
                }
                .form-label {
                    color: #ffffff !important;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                }
                .alert {
                    border-radius: 0.5rem;
                    border: none;
                }
                .alert-danger {
                    background-color: rgba(220, 53, 69, 0.1);
                    color: #dc3545;
                    border: 1px solid rgba(220, 53, 69, 0.2);
                }
                .mb-3 {
                    margin-bottom: 1rem;
                }
                .mt-3 {
                    margin-top: 1rem;
                }
                .w-100 {
                    width: 100%;
                }
                .me-2 {
                    margin-right: 0.5rem;
                }
                .fas {
                    font-family: 'Font Awesome 6 Free';
                    font-weight: 900;
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
                                               class="form-control" 
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
