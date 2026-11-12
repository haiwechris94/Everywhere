import { Component } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    })
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center bg-white rounded-xl shadow-lg p-8 max-w-md dark:bg-slate-800">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2 dark:text-slate-100">
              Une erreur s'est produite
            </h2>
            <p className="text-gray-600 mb-4 dark:text-slate-300">
              {this.props.fallbackMessage || "Quelque chose s'est mal passé. Veuillez réessayer."}
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left mb-4 p-3 bg-gray-100 rounded-lg text-sm dark:bg-slate-700">
                <summary className="cursor-pointer font-medium text-gray-700 dark:text-slate-300">
                  Détails de l'erreur
                </summary>
                <pre className="mt-2 text-xs text-red-600 overflow-auto dark:text-red-300">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="btn-primary btn-sm gap-2"
              >
                <RefreshCw size={18} />
                Réessayer
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors dark:text-slate-100"
              >
                Recharger la page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
