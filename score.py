'''
Used for deployment in realtime endpoint. Had to switch to ACI due to huge costs despite AzureML being functional
'''

import os
import joblib
import json
import numpy as np
from azureml.core.model import Model

def init():
    global model
    model_dir = os.getenv('AZUREML_MODEL_DIR')
    model_path = os.path.join(model_dir, 'environmental_model.pkl')
    
    model = joblib.load(model_path)

def run(raw_data):
    try:
        data = json.loads(raw_data)
        input_data = np.array([[
            data['hour'],
            data['day_of_week'], 
            data['month'],
            data['value_lag1'],
            data['value_lag24']
        ]])
        
        prediction = model.predict(input_data)
        
        return {'prediction': prediction[0]}
        
    except Exception as e:
        return {'error': str(e)}