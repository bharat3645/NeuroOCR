import React, { useState, useRef } from 'react';
import { ModelService } from '../services/modelService';

const ImageProcessor: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      setError('');
      setResult('');
    }
  };

  const processImage = async () => {
    if (!selectedImage) {
      setError('Please select an image first');
      return;
    }

    setProcessing(true);
    setError('');
    setResult('');

    try {
      const modelService = ModelService.getInstance();
      const text = await modelService.processImage(selectedImage);
      setResult(text);
    } catch (err) {
      setError('Error processing image. Please try again.');
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          ref={fileInputRef}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Select Image
        </button>
        {selectedImage && (
          <div className="mt-4">
            <p className="text-sm text-gray-600">Selected: {selectedImage.name}</p>
          </div>
        )}
      </div>

      <button
        onClick={processImage}
        disabled={!selectedImage || processing}
        className={`px-4 py-2 rounded ${
          !selectedImage || processing
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-green-500 hover:bg-green-600'
        } text-white`}
      >
        {processing ? 'Processing...' : 'Process Image'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h3 className="font-bold mb-2">Processed Result:</h3>
          <p className="whitespace-pre-wrap">{result}</p>
        </div>
      )}
    </div>
  );
};

export default ImageProcessor; 