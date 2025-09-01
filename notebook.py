'''
This is the basic tree model is connected to AzureML
Runs the backend logic for the project
'''

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import joblib
import json
from azure.storage.blob import BlobServiceClient
import time
from datetime import datetime, timedelta
import os

storage_account_name = "-"
storage_account_key = "-"
container_name = "-"

blob_service_client = BlobServiceClient(
    account_url=f"https://{storage_account_name}.blob.core.windows.net",
    credential=storage_account_key
)

def load_environmental_data():
    container_client = blob_service_client.get_container_client(container_name)
    dataframes = []
    for blob in container_client.list_blobs():
        if blob.name.endswith('.json'):
            blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob.name)
            blob_data = blob_client.download_blob().readall().decode('utf-8')
            
            for line in blob_data.strip().split('\n'):
                if line.strip(): 
                    try:
                        data = json.loads(line)
                        if isinstance(data, dict) and 'items' in data:
                            for reading in data['items']['readings']:                    
                                dataframes.append({
                                    'timestamp': data['items']['timestamp'],
                                    'station_id': reading['station_id'],
                                    'value': reading['value'],
                                })
                    except json.JSONDecodeError as e:
                        print(f"Error parsing line in {blob.name}: {e}")
                        continue
    return pd.DataFrame(dataframes)

def run_ml_pipeline():
    try:
        df = load_environmental_data()
        if len(df) < 100:
            print("Not enough data for retraining")
            return
        
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['hour'] = df['timestamp'].dt.hour
        df['day_of_week'] = df['timestamp'].dt.dayofweek
        df['month'] = df['timestamp'].dt.month
        df = df.sort_values(['station_id', 'timestamp'])
        df['value_lag1'] = df.groupby('station_id')['value'].shift(1)
        df['value_lag24'] = df.groupby('station_id')['value'].shift(24)
        df = df.dropna()
        
        feature_cols = ['hour', 'day_of_week', 'month', 'value_lag1', 'value_lag24']
        X = df[feature_cols]
        y = df['value']
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        model = RandomForestRegressor(n_estimators=50, max_depth=10, random_state=42)
        model.fit(X_train, y_train)
        
        y_pred = model.predict(X_test)
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        r2 = r2_score(y_test, y_pred)
        print(f"RMSE: {rmse:.2f}, R²: {r2:.3f}")
        
        model_filename = 'environmental_model.pkl'
        joblib.dump(model, model_filename)
        
        with open(model_filename, 'rb') as data:
            blob_client = blob_service_client.get_blob_client(container='processed-data-proj1', blob=f'models/{model_filename}')
            blob_client.upload_blob(data, overwrite=True)
        
        os.remove(model_filename)
        
    except Exception as e:
        print(f"Pipeline failed: {str(e)}")

def predict_environmental_value(hour, day_of_week, month, lag1, lag24):
    features = np.array([[hour, day_of_week, month, lag1, lag24]])
    blob_client = blob_service_client.get_blob_client(container='processed-data', blob='models/environmental_model.pkl')
    with open('temp_model.pkl', 'wb') as f:
        f.write(blob_client.download_blob().readall())
    model = joblib.load('temp_model.pkl')
    os.remove('temp_model.pkl')
    return model.predict(features)[0]

def run_scheduler():
    next_run = datetime.now()
    while True:
        if datetime.now() >= next_run:
            run_ml_pipeline()
            next_run = datetime.now() + timedelta(days=15)
        time.sleep(3600)

if __name__ == "__main__":
    run_scheduler()