import axios from 'axios';

const rawBaseUrl = import.meta.env.VITE_API_URL;
const baseURL = rawBaseUrl 
  ? (rawBaseUrl.endsWith('/api') ? rawBaseUrl : `${rawBaseUrl.replace(/\/+$/, '')}/api`)
  : '/api';

export const apiClient = axios.create({
  baseURL,
});

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  res => res,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.hash = '#/login';
    }
    return Promise.reject(error);
  }
);
