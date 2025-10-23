import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="text-center py-16">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-gray-600 mt-2">Page not found</p>
      <div className="mt-6">
        <Link to="/" className="text-indigo-600 underline">Go home</Link>
      </div>
    </div>
  )
}


