import * as tf from '@tensorflow/tfjs';
import { createWorker } from 'tesseract.js';

export class ModelService {
  private static instance: ModelService;
  private tfModel: tf.LayersModel | null = null;
  private tfModelLoaded: boolean = false;
  private tesseractWorker: any = null;
  private tesseractLoaded: boolean = false;
  private useTfModel: boolean = false;

  private constructor() {
    this.initializeModels();
  }

  public static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService();
    }
    return ModelService.instance;
  }

  private async initializeModels() {
    try {
      // Initialize Tesseract first as it's more reliable
      this.tesseractWorker = await createWorker();
      await this.tesseractWorker.loadLanguage('eng');
      await this.tesseractWorker.initialize('eng');
      this.tesseractLoaded = true;
      console.log('Tesseract initialized successfully');

      // Try to load TensorFlow model
      try {
        this.tfModel = await tf.loadLayersModel('/models/model.json');
        this.tfModelLoaded = true;
        this.useTfModel = true;
        console.log('TensorFlow model loaded successfully');
      } catch (tfError) {
        console.warn('TensorFlow model not available, using Tesseract only:', tfError);
        this.useTfModel = false;
      }
    } catch (error) {
      console.error('Error initializing models:', error);
      throw error;
    }
  }

  private async preprocessImage(imageFile: File): Promise<tf.Tensor> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const img = new Image();
          img.onload = async () => {
            const tensor = tf.browser.fromPixels(img)
              .resizeNearestNeighbor([224, 224])
              .toFloat()
              .div(255.0)
              .expandDims(0);
            resolve(tensor);
          };
          img.src = reader.result as string;
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
  }

  private async processWithTesseract(imageFile: File): Promise<string> {
    if (!this.tesseractLoaded) {
      throw new Error('Tesseract is not initialized yet');
    }

    try {
      const result = await this.tesseractWorker.recognize(imageFile);
      return result.data.text;
    } catch (error) {
      console.error('Tesseract processing error:', error);
      throw error;
    }
  }

  private async processWithTFModel(imageFile: File): Promise<string> {
    if (!this.tfModelLoaded || !this.useTfModel) {
      throw new Error('TensorFlow model is not available');
    }

    try {
      const tensor = await this.preprocessImage(imageFile);
      const predictions = await this.tfModel!.predict(tensor) as tf.Tensor;
      const result = await predictions.data();

      tensor.dispose();
      predictions.dispose();

      return this.processModelOutput(result);
    } catch (error) {
      console.error('TensorFlow processing error:', error);
      throw error;
    }
  }

  public async processImage(imageFile: File): Promise<string> {
    try {
      // Always use Tesseract as primary
      const tesseractResult = await this.processWithTesseract(imageFile);
      
      // Try to use TensorFlow model if available
      let tfResult = '';
      if (this.useTfModel) {
        try {
          tfResult = await this.processWithTFModel(imageFile);
        } catch (tfError) {
          console.warn('TensorFlow processing failed, using Tesseract result only:', tfError);
        }
      }

      // If we have both results, combine them
      if (tfResult) {
        return this.combineResults(tesseractResult, tfResult);
      }

      // Otherwise, return Tesseract result
      return tesseractResult;
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  }

  private processModelOutput(output: Float32Array): string {
    // Default implementation - returns the raw output
    // This should be customized based on your model's output format
    return Array.from(output)
      .map(value => String.fromCharCode(Math.round(value * 255)))
      .join('');
  }

  private combineResults(tesseractText: string, tfText: string): string {
    // Simple combination strategy - you can implement more sophisticated logic
    // For now, we'll use the longer text as it's likely more complete
    return tesseractText.length > tfText.length ? tesseractText : tfText;
  }

  public async terminate() {
    if (this.tfModel) {
      this.tfModel.dispose();
    }
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
    }
  }
} 