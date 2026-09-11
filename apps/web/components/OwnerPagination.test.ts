import { afterEach, expect, it, vi } from 'vitest';
import * as requests from './OwnerAuth';

afterEach(() => vi.unstubAllGlobals());
it.each([
  {statements:[]},
  {statements:[],pagination:{offset:0,limit:100,hasMore:true}},
  {statements:[{id:'a'}],pagination:{offset:5,limit:1,hasMore:false}},
  {statements:[{id:'a'}],pagination:{offset:0,limit:0,hasMore:false}},
  {statements:[{id:'a'}],pagination:{offset:0,limit:101,hasMore:false}},
  {statements:[{id:'a'}],pagination:{offset:0,limit:1,hasMore:'false'}},
  {statements:[{id:'a'}],pagination:{offset:0,limit:100,hasMore:true}},
  {statements:null,pagination:{offset:0,limit:100,hasMore:false}},
])('rejects incomplete or invalid pagination rather than exposing partial data: %j', async page => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json(page)).mockResolvedValue(Response.json({statements:[],pagination:{offset:100,limit:100,hasMore:false}})));
  await expect(requests.ownerRequestAll('/statements','statements')).rejects.toThrow('Unable to load the complete list');
});
it('rejects a later-page failure without returning the first page', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({statements:[{id:'a'}],pagination:{offset:0,limit:1,hasMore:true}})).mockResolvedValueOnce(Response.json({error:'Page unavailable'},{status:503})));
  await expect(requests.ownerRequestAll('/statements','statements')).rejects.toThrow('Page unavailable');
});
it('collects every page, preserving metadata and existing query filters', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({owner:{name:'Example'},statements:[{id:'a'}],pagination:{offset:0,limit:1,hasMore:true}})).mockResolvedValueOnce(Response.json({owner:{name:'Example'},statements:[{id:'b'}],pagination:{offset:1,limit:1,hasMore:false}}));
  vi.stubGlobal('fetch',fetcher);
  await expect(requests.ownerRequestAll('/statements?year=2026','statements')).resolves.toMatchObject({owner:{name:'Example'},statements:[{id:'a'},{id:'b'}]});
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/owner-relations/statements?year=2026&offset=0&limit=100','/api/owner-relations/statements?year=2026&offset=1&limit=100']);
});
