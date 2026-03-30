/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  
  // Environment validation - ensure required vars are set on server
  async serverRuntimeConfig() {
    const requiredVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];
    
    // Log warning for missing required variables (not blocking in dev)
    if (process.env.NODE_ENV === 'production') {
      requiredVars.forEach(varName => {
        if (!process.env[varName]) {
          console.warn(`Warning: ${varName} is not set in production environment`);
        }
      });
    }
    
    return {
      // Pass these to the server runtime
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  },
  
  // Vercel deployment optimizations
  poweredByHeader: false,
  compress: true,
  
  // Experimental features for performance
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;
