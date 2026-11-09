module.exports = {
  dependency: {
    platforms: {
      ios: { podspecPath: './UnikitWasmSpike.podspec' },
      android: {
        sourceDir: './android',
        packageImportPath:
          'import dev.unikit.wasmspike.UnikitWasmSpikePackage;',
        packageInstance: 'new UnikitWasmSpikePackage()',
      },
    },
  },
};
