from flask import Flask, request, jsonify
import joblib
import numpy as np
import os
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Global model variable
model = None

def load_model():
    """Load the ML model on startup"""
    global model
    try:
        model_path = 'environmental_model.pkl'
        logger.info(f"Attempting to load model from: {model_path}")
        
        if not os.path.exists(model_path):
            logger.error(f"Model file not found: {model_path}")
            raise FileNotFoundError(f"Model file not found: {model_path}")
        
        model = joblib.load(model_path)
        logger.info("Model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        return False

# Load the model when the module is imported (CRITICAL FIX!)
logger.info("Loading model at application startup...")
if not load_model():
    logger.error("Failed to load model during startup")
    # Don't exit here since we're being imported by waitress
else:
    logger.info("Model ready for predictions")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.1'
    })

@app.route('/score', methods=['POST'])
def score():
    """Main prediction endpoint"""
    try:
        if model is None:
            logger.error("Model not loaded")
            return jsonify({'error': 'Model not loaded'}), 500
            
        # Get JSON data from request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Validate required fields
        required_fields = ['hour', 'day_of_week', 'month', 'value_lag1', 'value_lag24']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            return jsonify({
                'error': f'Missing required fields: {missing_fields}',
                'required_fields': required_fields
            }), 400
        
        # Validate data types and ranges
        try:
            hour = float(data['hour'])
            day_of_week = float(data['day_of_week'])
            month = float(data['month'])
            value_lag1 = float(data['value_lag1'])
            value_lag24 = float(data['value_lag24'])
            
            # Basic validation
            if not (0 <= hour <= 23):
                return jsonify({'error': 'Hour must be between 0 and 23'}), 400
            if not (0 <= day_of_week <= 6):
                return jsonify({'error': 'Day of week must be between 0 and 6'}), 400
            if not (1 <= month <= 12):
                return jsonify({'error': 'Month must be between 1 and 12'}), 400
                
        except (ValueError, TypeError) as e:
            return jsonify({'error': f'Invalid data types: {str(e)}'}), 400
        
        # Prepare input data for model
        input_data = np.array([[hour, day_of_week, month, value_lag1, value_lag24]])
        
        # Make prediction
        prediction = model.predict(input_data)
        
        # Log the prediction (for monitoring)
        logger.info(f"Prediction made: {prediction[0]:.2f}")
        
        return jsonify({
            'prediction': float(prediction[0]),
            'timestamp': datetime.utcnow().isoformat(),
            'input_features': {
                'hour': hour,
                'day_of_week': day_of_week,
                'month': month,
                'value_lag1': value_lag1,
                'value_lag24': value_lag24
            }
        })
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # This block only runs when called directly with python app.py
    # For production with waitress, the model is loaded above
    logger.info("Running in development mode")
    app.run(host='0.0.0.0', port=5000, debug=False)