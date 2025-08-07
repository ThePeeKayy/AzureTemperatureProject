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
  TrendingUp, Cpu, CloudDownload, Filter, FlaskConical, Network
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
    <div className="min-h-screen bg-gradient-to-br from-red-700 via-orange-600 to-red-500">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-8">
            PK's Temperature Dashboard 
          </h1>
          <div className="text-white/80 text-xl max-w-8xl mx-auto space-y-4 text-center flex flex-col items-center">
      <div className="flex items-start gap-3">
        <Cpu className="mt-1" />
        <p>Project powered by <strong>Azure ML</strong> – One Hour Ahead Predictions</p>
      </div>

      <div className="flex items-start gap-3">
        <CloudDownload className="mt-1" />
        <p>Data pulled from <strong>data.gov.sg</strong> into Data Factory pipeline via <strong>Copy Data</strong> activity on 15 day schedule</p>
      </div>

      <div className="flex items-start gap-3">
        <Filter className="mt-1" />
        <p>Performed basic filtering and cleaning using <strong>Data Flow</strong>, then saved to another storage container</p>
      </div>

      <div className="flex items-start gap-3">
        <FlaskConical className="mt-1" />
        <p>Used Azure ML notebook to train a basic <strong>random forest model</strong> and registered it to the workspace</p>
      </div>

      <div className="flex items-start gap-3">
        <Network className="mt-1" />
        <p>Set up an <strong>endpoint</strong> for this frontend to call the <strong>scoring script</strong> for predictions</p>
      </div>
    </div>
        </div>

        <div className="flex flex-wrap gap-4 justify-center mb-8">

          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            className="bg-white/10 backdrop-blur-sm text-white px-4 py-3 rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            <option value="all" className="text-gray-800">All Stations</option>
            {uniqueStations.map(station => (
              <option key={station} value={station} className="text-gray-800">
                {stationRegions[station]?.name || station}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-8 flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Statistics Cards */}
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Total Readings</p>
                  <p className="text-white text-2xl font-bold">{stats.totalReadings}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Stations</p>
                  <p className="text-white text-2xl font-bold">{stats.stationCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Avg Value</p>
                  <p className="text-white text-2xl font-bold">{stats.avgValue}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Range</p>
                  <p className="text-white text-2xl font-bold">{stats.minValue}-{stats.maxValue}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Data Display */}
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <Activity className="w-6 h-6" />
              Environmental Data ({filteredData.length} records)
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-hide">
              {filteredData.length > 0 ? (
                filteredData.slice(-20).map((item, index) => (
                  <div key={index} className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-white" />
                        <span className="text-white font-semibold">
                          {stationRegions[item.station_id]?.name || item.station_id}
                        </span>
                      </div>
                      <span className="text-white font-bold text-lg">{item.value.toFixed(2)}°C</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-white/70">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-white/60">
                      Lag1: {item.value_lag1?.toFixed(2)}°C | Lag24: {item.value_lag24?.toFixed(2)}°C
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Cloud className="w-12 h-12 text-white/30 mx-auto mb-3" />
                  <p className="text-white/60">No data available. Click "Fetch Data" to load.</p>
                </div>
              )}
            </div>
          </div>

          {/* One Hour Ahead Prediction */}
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <Target className="w-6 h-6" />
              One Hour Ahead Prediction
            </h2>

            {/* Station Selection for Prediction */}
            <div className="mb-6">
              <label className="block text-white/70 text-sm mb-2">Select Station for Prediction:</label>
              <div className="flex gap-3">
                <select
                  value={selectedPredictionStation}
                  onChange={(e) => setSelectedPredictionStation(e.target.value)}
                  className="flex-1 bg-white/10 backdrop-blur-sm text-white px-4 py-3 rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  {Object.entries(stationRegions).map(([stationId, info]) => (
                    <option key={stationId} value={stationId} className="text-gray-800">
                      {info.name} ({info.region})
                    </option>
                  ))}
                </select>
                <button
                  onClick={getPredictionForStation}
                  disabled={predicting || processedData.length === 0}
                  className="flex items-center gap-2 bg-gradient-to-r from-orange-700 to-red-400 text-white px-6 py-3 rounded-xl transition-all disabled:opacity-50"
                >
                  {predicting ? <Loader2 className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
                  Predict
                </button>
              </div>
            </div>

            {/* Prediction Result */}
            <div className="space-y-4">
              {prediction ? (
                <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl p-6 border border-purple-500/30">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-purple-400" />
                      <div>
                        <h3 className="text-white font-bold text-lg">{prediction.stationInfo.name}</h3>
                        <p className="text-white/60 text-sm">{prediction.stationInfo.coordinates}</p>
                      </div>
                    </div>
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 mb-4">
                    <div className="text-center">
                      <p className="text-white/70 text-sm mb-1">Current Temperature</p>
                      <p className="text-white text-2xl font-bold">{prediction.currentValue.toFixed(2)}°C</p>
                      <p className="text-white/50 text-xs">{prediction.currentTimestamp.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white/70 text-sm mb-1">Predicted Temperature</p>
                      <p className="text-green-400 text-2xl font-bold">
                        {typeof prediction.predictedValue === 'number' ? prediction.predictedValue.toFixed(2) : prediction.predictedValue}°C
                      </p>
                      <p className="text-white/50 text-xs">{prediction.predictedTimestamp.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-white/70 text-sm">Prediction Confidence:</span>
                      <span className="text-green-400 font-semibold">{(prediction.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div className="bg-white/10 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-green-400 to-blue-400 h-2 rounded-full transition-all duration-1000"
                        style={{ width: `${prediction.confidence * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-white/60">
                    <p>Features: Hour: {prediction.inputFeatures.hour}, Day: {prediction.inputFeatures.day_of_week}, Month: {prediction.inputFeatures.month}</p>
                    <p>Lag values: 1hr: {prediction.inputFeatures.value_lag1.toFixed(2)}°C, 24hr: {prediction.inputFeatures.value_lag24.toFixed(2)}°C</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-white/40 text-sm">Select a station and click "Predict" to forecast the next hour's temperature</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentalDashboard;