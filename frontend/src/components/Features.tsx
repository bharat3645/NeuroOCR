// Define the type for each feature
interface Feature {
  title: string;
  description: string;
}

const Features = () => {
  // Typed array of features
  const features: Feature[] = [
    {
      title: 'Runs In-Browser',
      description: 'TensorFlow.js runs the model on your device — images are never uploaded anywhere',
    },
    {
      title: 'Confidence Scores',
      description: 'Every recognition includes a per-character confidence estimate, not just raw text',
    },
    {
      title: 'Local History',
      description: 'Past recognitions are saved to your browser so you can revisit them later',
    },
    {
      title: 'Open Training Pipeline',
      description: 'The full training + conversion pipeline behind the model ships in /training',
    },
  ];

  return (
    <section className="bg-gray-900 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          Features
        </h2>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-black border border-gray-800 rounded-lg p-6 hover:border-gray-700 transition-colors"
            >
              <h3 className="text-xl font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
