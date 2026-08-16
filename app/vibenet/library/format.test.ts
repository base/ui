import { humanizeKey } from './format';

describe('humanizeKey', () => {
  it('splits embedded acronym boundaries from the next word', () => {
    expect(humanizeKey('myUSDCToken')).toBe('My USDC Token');
    expect(humanizeKey('someAPIKey')).toBe('Some API Key');
    expect(humanizeKey('lidoWSTETHVault')).toBe('Lido WSTETH Vault');
  });

  it('preserves existing camelCase and separator behavior', () => {
    expect(humanizeKey('usdvToken')).toBe('Usdv Token');
    expect(humanizeKey('l2OutputOracle')).toBe('L2 Output Oracle');
    expect(humanizeKey('base-usdc_bridge')).toBe('Base Usdc Bridge');
  });
});
