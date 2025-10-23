import axios from 'axios'

const envBase = (import.meta as any)?.env?.VITE_API_URL as string | undefined
const baseURL = envBase ? envBase.replace(/\/$/, '') : '/api'

export const http = axios.create({ baseURL })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})


