import { QueryClient } from '@tanstack/react-query';

describe('kitchen change cache clear', () => {
  it('clears react-query cache like selectKitchen', async () => {
    const client = new QueryClient();
    client.setQueryData(['stock-summary', 'old'], [{ productId: '1' }]);
    client.setQueryData(['shopping-list', 'old'], [{ id: 'a' }]);
    await client.cancelQueries();
    client.clear();
    expect(client.getQueryData(['stock-summary', 'old'])).toBeUndefined();
    expect(client.getQueryData(['shopping-list', 'old'])).toBeUndefined();
  });
});
