package com.alibaba.umodel.search;

import com.alibaba.umodel.contract.UModelModels.SearchCapabilities;
import com.alibaba.umodel.contract.UModelModels.SearchHealth;
import com.alibaba.umodel.contract.UModelModels.SearchRequest;
import com.alibaba.umodel.contract.UModelModels.SearchResult;

import java.util.List;

public interface SearchService {
    void openWorkspace(String workspace);

    void index(String workspace, List<SearchChunk> chunks);

    void deleteByDocId(String workspace, List<String> docIds);

    SearchResult keyword(String workspace, SearchRequest request);

    SearchResult vector(String workspace, SearchRequest request);

    SearchResult hybrid(String workspace, SearchRequest request);

    SearchCapabilities capabilities();

    SearchHealth health();
}
