import apiClient from './apiClient';

let otpStore = {}; // Local OTP store

// Generate 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// SEND OTP (no alert, returns otp)
export const sendOtpAPI = async (identifier) => {
  const otp = generateOTP();
  otpStore[identifier] = otp;

  return { success: true, otp }; // return otp for UI card
};

// VERIFY OTP
export const verifyOtpAPI = async (identifier, otp) => {
  if (otpStore[identifier] === otp) {
    delete otpStore[identifier];
    return { success: true };
  }
  return { success: false };
};

// Login API call
export const loginAPI = async (email, password) => {
  try {
    const response = await apiClient.post('/api/auth/login', { email, password });
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Login failed. Please try again.';
  }
};

// Register API call
export const registerAPI = async (name, email, password, phone) => {
  try {
    const response = await apiClient.post('/api/auth/register', {
      name,
      email,
      password,
      phone,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Registration failed. Please try again.';
  }
};

// Google Login API call
// role: "VENDOR" or "DELIVERY" to log in an existing partner account (never creates a customer).
export const googleLoginAPI = async (idToken, email, name, role) => {
  try {
    const payload = idToken || email || name ? (idToken ? { idToken, ...(role ? { role } : {}) } : { email, name }) : null;
    const response = payload
      ? await apiClient.post('/api/auth/google', payload)
      : await apiClient.get('/api/auth/google');
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Google authentication failed. Please try again.';
  }
};

// Profile API call
export const getProfileAPI = async (userId) => {
  try {
    const response = await apiClient.get(`/api/auth/profile/${userId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Failed to fetch user profile.';
  }
};

// Update Profile API call
export const updateProfileAPI = async (userId, data) => {
  try {
    const response = await apiClient.put(`/api/auth/profile/${userId}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Failed to update user profile.';
  }
};

// Forgot Password API call
export const forgotPasswordAPI = async (email) => {
  try {
    const response = await apiClient.post('/api/auth/forgot', { email });
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Failed to request password reset.';
  }
};

// Reset Password API call
export const resetPasswordAPI = async (email, password) => {
  try {
    const response = await apiClient.post('/api/auth/reset', { email, password });
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Failed to reset password.';
  }
};

// Atomically add an amount to user's wallet balance
// POST /api/auth/wallet/{userId}/add  body: { amount: number }
export const addWalletBalanceAPI = async (userId, amount) => {
  try {
    const response = await apiClient.post(`/api/auth/wallet/${userId}/add`, { amount });
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Failed to update wallet balance.';
  }
};
