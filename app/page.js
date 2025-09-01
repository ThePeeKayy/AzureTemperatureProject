'use client'

import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  Download, 
  Activity, 
  Clock,
  MapPin,
  Loader2,
  AlertCircle,
  CheckCircle,
  Target,
  TrendingUp, Cpu, CloudDownload, Filter, FlaskConical, Network, ThermometerIcon
} from 'lucide-react';

const EnvironmentalDashboard = () => {
  const [rawData, setRawData] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStation, setSelectedStation] = useState('all');
  const [selectedPredictionStation, setSelectedPredictionStation] = useState('S001');
  const [stats, setStats] = useState({});

  const stationRegions = {
    'S001': { name: 'North Singapore', region: 'North', coordinates: '1°25\'N, 103°49\'E' },
    'S002': { name: 'South Singapore', region: 'South', coordinates: '1°18\'N, 103°49\'E' },
    'S003': { name: 'East Singapore', region: 'East', coordinates: '1°21\'N, 103°56\'E' },
    'S004': { name: 'West Singapore', region: 'West', coordinates: '1°21\'N, 103°42\'E' },
    'S005': { name: 'Central Singapore', region: 'Central', coordinates: '1°21\'N, 103°49\'E' }
  };

  const fetchBlobData = async () => {
    setLoading(true);
    setError(null);

    try {
      const simulatedData = generateSimulatedData();
      setRawData(simulatedData);
      
      const processed = processEnvironmentalData(simulatedData);
      setProcessedData(processed);
      
      calculateStats(processed);
      
    } catch (err) {
      setError(`Failed to fetch data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateSimulatedData = () => {
    const stations = ['S001', 'S002', 'S003', 'S004', 'S005'];
    const data = [];
    const now = new Date();

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const timestamp = new Date(now.getTime() - (day * 24 + hour) * 60 * 60 * 1000);
        
        stations.forEach(stationId => {
          const baseValue = 20 + Math.sin(hour * Math.PI / 12) * 10; 
          const seasonalFactor = Math.sin(timestamp.getMonth() * Math.PI / 6) * 5;
          const noise = (Math.random() - 0.5) * 4;
          const stationFactor = stations.indexOf(stationId) * 2;
          
          data.push({
            timestamp: timestamp.toISOString(),
            station_id: stationId,
            value: Math.max(0, baseValue + seasonalFactor + noise + stationFactor)
          });
        });
      }
    }
    
    return data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  };

  const processEnvironmentalData = (data) => {
    const df = data.map(item => ({
      ...item,
      timestamp: new Date(item.timestamp),
      hour: new Date(item.timestamp).getHours(),
      day_of_week: new Date(item.timestamp).getDay(),
      month: new Date(item.timestamp).getMonth() + 1,
    }));

    // Sort by station and timestamp
    df.sort((a, b) => {
      if (a.station_id !== b.station_id) {
        return a.station_id.localeCompare(b.station_id);
      }
      return a.timestamp - b.timestamp;
    });

    const processed = [];
    for (let i = 0; i < df.length; i++) {
      const current = df[i];
      
      const lag1 = df.find((item, idx) => 
        idx < i && 
        item.station_id === current.station_id &&
        (current.timestamp - item.timestamp) <= 2 * 60 * 60 * 1000 
      );
      
      const lag24 = df.find((item, idx) => 
        idx < i && 
        item.station_id === current.station_id &&
        Math.abs((current.timestamp - item.timestamp) - 24 * 60 * 60 * 1000) <= 2 * 60 * 60 * 1000 // within 2 hours of 24h ago
      );

      if (lag1 && lag24) {
        processed.push({
          ...current,
          value_lag1: lag1.value,
          value_lag24: lag24.value
        });
      }
    }

    return processed;
  };

  const calculateStats = (data) => {
    if (data.length === 0) return;

    const stations = [...new Set(data.map(d => d.station_id))];
    const avgValue = data.reduce((sum, d) => sum + d.value, 0) / data.length;
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));

    setStats({
      totalReadings: data.length,
      stationCount: stations.length,
      avgValue: avgValue.toFixed(2),
      maxValue: maxValue.toFixed(2),
      minValue: minValue.toFixed(2),
      latestReading: data[data.length - 1]?.timestamp || null
    });
  };

  const getPredictionForStation = async () => {
    if (processedData.length === 0) {
      setError('No processed data available for predictions');
      return;
    }

    setPredicting(true);
    setError(null);
    setPrediction(null);

    try {
      const stationData = processedData
        .filter(d => d.station_id === selectedPredictionStation)
        .sort((a, b) => b.timestamp - a.timestamp);

      if (stationData.length === 0) {
        throw new Error(`No data available for station ${selectedPredictionStation}`);
      }

      const latestDataPoint = stationData[0];
      
      const nextHour = new Date(latestDataPoint.timestamp.getTime() + 60 * 60 * 1000);
      const inputData = {
        hour: nextHour.getHours(),
        day_of_week: nextHour.getDay(),
        month: nextHour.getMonth() + 1,
        value_lag1: latestDataPoint.value, 
        value_lag24: latestDataPoint.value_lag24 
      };
          
      const response = await fetch('/api/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const result = await response.json();
      
      setPrediction({
        stationId: selectedPredictionStation,
        stationInfo: stationRegions[selectedPredictionStation],
        currentValue: latestDataPoint.value,
        currentTimestamp: latestDataPoint.timestamp,
        predictedTimestamp: nextHour,
        predictedValue: result.prediction || result.result?.[0] || 'N/A',
        inputFeatures: inputData,
        confidence: Math.random() * 0.3 + 0.7 // Simulate confidence score
      });

    } catch (err) {
      setError(`Prediction failed: ${err.message}`);
      console.error('Prediction error:', err);
    } finally {
      setPredicting(false);
    }
  };

  const filteredData = selectedStation === 'all' 
    ? processedData 
    : processedData.filter(d => d.station_id === selectedStation);

  const uniqueStations = [...new Set(processedData.map(d => d.station_id))];

  useEffect(() => {
    fetchBlobData();
  }, []);

  return (
    <div className="text-center mb-12">
          {/* Header */}
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 mb-8 border border-white/20">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 bg-gradient-to-r from-blue-200 to-white bg-clip-text">
              🌡️ PK's Temperature Dashboard 🌱
            </h1>
            <p className="text-white/70 text-lg mb-6">
              Real-time Singapore temperature monitoring with Azure ML predictions
            </p>
            
            {/* GitHub Link */}
            <div className="flex justify-center mb-6">
              <a 
                href="https://github.com/ThePeeKayy/AzureTemperatureProject" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-gray-800/50 hover:bg-gray-800/70 text-white px-6 py-3 rounded-xl transition-all duration-300 border border-gray-600/50"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                </svg>
                View Source Code
              </a>
            </div>

            {/* Cost Migration Notice */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-center gap-2 text-yellow-300">
                <AlertCircle className="w-5 h-5" />
                <p className="font-semibold">💰 Cost Optimization Update</p>
              </div>
              <p className="text-yellow-200/80 text-sm mt-2">
                Migrated from Azure ML endpoints to <strong>Azure Container Apps</strong> due to high compute costs. 
                This demo now uses simulated data with the same ML pipeline architecture.
              </p>
            </div>
          </div>

          {/* Architecture Overview */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center justify-center gap-3">
              <Network className="w-6 h-6" />
              Azure Architecture Overview
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-3 p-4 bg-white/5 rounded-xl">
                <CloudDownload className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-white font-semibold mb-1">Data Ingestion</p>
                  <p className="text-white/70">Data Factory pulls from <strong>data.gov.sg</strong> on 15-day schedule</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-white/5 rounded-xl">
                <Filter className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-white font-semibold mb-1">Data Processing</p>
                  <p className="text-white/70">Data Flow activities clean and transform raw temperature data</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-white/5 rounded-xl">
                <FlaskConical className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-white font-semibold mb-1">ML Training</p>
                  <p className="text-white/70">Azure ML workspace trains <strong>Random Forest</strong> model</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-white/5 rounded-xl">
                <Cpu className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-white font-semibold mb-1">Prediction API</p>
                  <p className="text-white/70">Container Apps host the model for <strong>one-hour ahead</strong> forecasts</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-white/5 rounded-xl">
                <ThermometerIcon className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-white font-semibold mb-1">Real-time Dashboard</p>
                  <p className="text-white/70">React frontend displays live data and predictions</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-white/5 rounded-xl">
                <Activity className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-white font-semibold mb-1">Monitoring</p>
                  <p className="text-white/70">Application Insights tracks performance and usage metrics</p>
                </div>
              </div>
            </div>
          </div>
        </div>
  );
};

export default EnvironmentalDashboard;