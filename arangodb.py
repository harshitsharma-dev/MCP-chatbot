"""
the python script for instantiating db connections to different databases specified by their url
different functions for database queries designated for various tasks
"""


from pyArango.connection import *


"""
function which makes connection to news db
"""


def instantiate_news_db(**kwargs):
    if kwargs['url']:
        conn = Connection(arangoURL=kwargs['url'], username='root', password='i-0172f1f969c7548c4')

    else:
        conn = Connection(username='root',password='i-0172f1f969c7548c4')

    try:
        adb = conn['newsDB2022']
        graph = adb.graphs['newsGraph']

    except Exception as e:
        print('Exception occurred while connecting to database : {0}'.format(e))
        raise e

    return adb, graph


"""
function which makes connection to vid db
"""


def instantiate_vid_db(**kwargs):
    if kwargs['url']:
        conn = Connection(arangoURL=kwargs['url'],username='root',password='i-0172f1f969c7548c4')
    else:
        conn = Connection(username='root',password='i-0172f1f969c7548c4')

    try:
        adb = conn['newsDB2022']
        graph = adb.graphs['video_Metadata']


    except Exception as e:
        print('Exception occurred while connecting to database : {0}'.format(e))
        raise e

    return adb, graph


"""
function to execute db query given that input query string and dict of bind parameters
"""


def db_query_execute(queryStr, bindParams, dbname, connurl, batchsize=100):
    """
    :param queryStr: query string which needs to be executed
    :type queryStr: str
    :param bindParams: bind parameters which needs to be passed as parameters for query to execute
    :type bindParams: dict
    :param dbname: name of database where the query needs to be executed
    :type dbname: str
    :param connurl: connection url to the database, None for local connection
    :type connurl: str / None
    :param batchsize: size of the resultant object / no of docs to be retrieved from db
    :type batchsize: int
    :return: no return object, create doc into the database
    """

    ###instantiate connection to database
    if dbname == "newsDB":
        adbclient, graph = instantiate_news_db(url=connurl)

    else: ###for video data db
        adbclient, graph = instantiate_vid_db(url=connurl)

    ###query execution
    doc_create_query = adbclient.AQLQuery(query=queryStr,bindVars=bindParams,batchSize=batchsize)

    ###closing connection to the database
    adbclient.connection.session.disconnect()

    return doc_create_query


"""
function to get articles related to a given query article connected through cr/lr relations in graph
with unsetting specific attributes in the return result from db
"""


def get_crlr_related_articles_unset(articlekey, graph_depth, edgecollectionname, sim_threshold, db_url):
    """

    :param articlekey: key for query article
    :param graph_depth: depth until which graph traversal to be done
    :param edgeColl: edge Collection name which connects cr/lr related articles
    :param sim_threshold: similarity threshold for selecting articles
    :param db_url: database url for connection
    :return: related articles
    """

    ###instantiate db connection
    adbclient, _ = instantiate_news_db(url=db_url)

    ###query to db getting related articles connected through cr/lr relations
    related_articles_query = adbclient.AQLQuery("FOR article IN Article FILTER article._key==@key FOR v,e,p IN @depth OUTBOUND article GRAPH 'newsGraph' FILTER SPLIT(e._id,'/')[0]==@edgeColl && v._id!=article._id FILTER e.sim_value<@sim_threshold RETURN DISTINCT {'articleID':v._key,'category':v.category,'subcategory':v.subcategory,'default':UNSET(v.default,'description','docID','image','summary','url'),'default_image':v.default_image,'read':[UNSET(v.read[0],'description','docID','image','summary','url')],'watch':[UNSET(v.watch[0],'description','image','url','videoID')],'tag':v.source_tags[0]}",
                                                bindVars={'key':articlekey,'depth':graph_depth, 'edgeColl':edgecollectionname,'sim_threshold':sim_threshold})

    related_articles = related_articles_query.response['result']

    return related_articles


"""
function to get related articles for a given query article through lr/cr relations in graph
returning entire object from db
"""


def get_crlr_related_articles(articlekey, graph_depth, edge_collection_name, sim_threshold, db_url):
    """

    :param articlekey: key of query article
    :param graph_depth: depth until which graph traversal to be done
    :param edge_collection_name: edge collection name connecting cr/lr related documents
    :param sim_threshold: sim threshold to filter articles
    :param db_url: url for db connection
    :return: array of related articles
    """

    ###instantiate db connection
    adbclient, _ = instantiate_news_db(url=db_url)

    ###query to db getting related articles connected through cr/lr relations
    related_articles_query = adbclient.AQLQuery(
        "FOR article IN Article FILTER article._key==@key FOR v,e,p IN @depth OUTBOUND article GRAPH 'newsGraph' FILTER SPLIT(e._id,'/')[0]==@edgeColl && v._id!=article._id FILTER e.sim_value<@sim_threshold RETURN DISTINCT {'articleID':v._key,'category':v.category,'subcategory':v.subcategory,'default':v.default,'default_image':v.default_image,'read':[v.read[0]],'watch':[v.watch[0]],'source_tags':v.source_tags}",
        bindVars={'key': articlekey, 'depth': graph_depth, 'edgeColl': edge_collection_name,
                  'sim_threshold': sim_threshold})

    related_articles = related_articles_query.response['result']

    return related_articles


"""
function to get related articles for a given query articles based on number of path connecting between query article and any other articles
with unset function to remove specific attributes from return result
"""


def get_path_related_articles_unset(articlekey, graph_depth, limit, db_url, epochtime):
    """

    :param articlekey: key of query article
    :param graph_depth: depth until which graph traversal to be done
    :param limit: filtered no. of return results
    :param db_url: connection url for the database
    :param epochtime: epochtime (unix format) for 8 hours
    :return: array of related articles
    """

    ###instantiate db connection
    adbclient, _ = instantiate_news_db(url=db_url)

    ###query to db getting related articles connected through cr/lr relations
    related_articles_query = adbclient.AQLQuery(
        "LET epochtime_8hours=@epochtime FOR article IN Article FILTER article._key==@key LET query_epochtime=article.default.epoch_time LET related_docs=(FOR doc IN Document FILTER doc.url==article.default.url FOR v1,e1,p1 IN @depth OUTBOUND doc GRAPH 'newsGraph' FILTER e1.ne_tf>0 || e1.np_tf>0 || e1.ep_tf>0 FOR v2,e2,p2 IN @depth INBOUND v1 GRAPH 'newsGraph' FILTER v2._id!=doc._id && v2.source==doc.source COLLECT target_url=p2.vertices[1]['url'] WITH COUNT INTO no_of_paths SORT no_of_paths DESC LIMIT @limit RETURN {'url':target_url,'no_of_paths':no_of_paths}) FOR doc1 IN related_docs FOR article1 IN Article FILTER article1.default.url==doc1.url FILTER to_number(article1.default.epochtime) > (to_number(query_epochtime)-to_number(epochtime_8hours)) && to_number(article1.default.epoch_time) < (to_number(query_epochtime)+to_number(epochtime_8hours)) SORT doc1.no_of_paths DESC RETURN {'articleID':article1._key,'category':article1.category,'subcategory':article1.subcategory,'default':UNSET(article1.default,'description','docID','image','summary','url'),'default_image':article1.default_image,'read':[UNSET(article1.read[0],'description','docID','image','summary','url')],'watch':[UNSET(article1.watch[0],'description','image','url','videoID')],'tag':article1.source_tags[0]}",
        bindVars={'key': articlekey, 'depth': graph_depth, 'limit': limit, 'epochtime': epochtime}, batchSize=400)

    related_articles = related_articles_query.response['result']

    return related_articles


"""
function to get related articles based on number of connecting paths between query article and other articles
entire object to be returned 
"""


def get_path_related_articles(db_url, traversal_depth, qa_category, qa_key, threshold_epochtime, no_of_results, *args):

    """
    :param db_url: connection url for database
    :param qa_topterms: list of top terms from the query article
    :param qa_key: _key string of query article
    :param traversal_depth: depth till which graph traversal to be done
    :param qa_epochtime: query article epochtime (published time)
    :param qa_category: category of query article
    :param threshold_epochtime: limit epochtime for results
    :param no_of_results: no of results
    :param args: optional argument for input origin list
    :return: array of related articles
    """

    ###initialize variables
    path_articles = list()

    ###instantiate db connection
    adbclient, _ = instantiate_news_db(url=db_url)

    ###query to db getting related articles connected through entities - path added
    ####case 1 - get origin from input and filtering articles on that
    if args:
        ip_origin = args[0]
        ###querying db to get related articles
        related_articles_query = adbclient.AQLQuery(
            "LET graph_rel_articles=(FOR article IN Article FILTER article._key==@articlekey FOR v,e,p IN @depth ANY article GRAPH 'newsGraph' FILTER length(intersection(@iporigin,e.origin))>0 && @cat IN v.category && v._key!=@articlekey && (to_number(v.default.epoch_time)>(to_number(article.default.epoch_time)-to_number(@threshold_epochtime)) && to_number(v.default.epoch_time)<(to_number(article.default.epoch_time)+to_number(@threshold_epochtime))) COLLECT aid=v._id WITH COUNT INTO no_of_paths RETURN DISTINCT {'aid':aid,'no_of_paths':no_of_paths})"
            "FOR relart IN graph_rel_articles SORT relart.no_of_paths DESC FOR article IN Article FILTER article._id==relart.aid LIMIT @limit RETURN {'article':article,'no_of_paths':relart.no_of_paths}",
            bindVars={'depth': traversal_depth, 'cat': qa_category, 'articlekey': qa_key,
                      'threshold_epochtime': threshold_epochtime, 'limit': no_of_results, 'iporigin': ip_origin})

    ###case 2 - origin is taken query article's edges and traversed to filter based on that
    else:
        related_articles_query = adbclient.AQLQuery("LET graph_rel_articles=(FOR article IN Article FILTER article._key==@articlekey FOR v,e,p IN @depth ANY article GRAPH 'newsGraph' LET iporigin=e.origin FILTER iporigin!=null && iporigin!=[] && length(intersection(iporigin,e.origin))>0 && @cat IN v.category && v._key!=@articlekey && (to_number(v.default.epoch_time)>(to_number(article.default.epoch_time)-to_number(@threshold_epochtime)) && to_number(v.default.epoch_time)<(to_number(article.default.epoch_time)+to_number(@threshold_epochtime))) COLLECT aid=v._id WITH COUNT INTO no_of_paths RETURN DISTINCT {'aid':aid,'no_of_paths':no_of_paths})"
                                                    "FOR relart IN graph_rel_articles SORT relart.no_of_paths DESC FOR article IN Article FILTER article._id==relart.aid LIMIT @limit RETURN {'article':article,'no_of_paths':relart.no_of_paths}",
                                                    bindVars={'depth': traversal_depth, 'cat': qa_category, 'articlekey': qa_key, 'threshold_epochtime': threshold_epochtime, 'limit': no_of_results})

    ###query without filtering on origin attribute
    # related_articles_query = adbclient.AQLQuery(
    #     "LET graph_rel_articles=(FOR article IN Article FILTER article._key==@articlekey FOR v,e,p IN @depth ANY article GRAPH 'newsGraph' FILTER @cat IN v.category && v._key!=@articlekey && (to_number(v.default.epoch_time)>(to_number(article.default.epoch_time)-to_number(@threshold_epochtime)) && to_number(v.default.epoch_time)<(to_number(article.default.epoch_time)+to_number(@threshold_epochtime))) COLLECT aid=v._id WITH COUNT INTO no_of_paths RETURN DISTINCT {'aid':aid,'no_of_paths':no_of_paths})"
    #     "FOR relart IN graph_rel_articles SORT relart.no_of_paths DESC FOR article IN Article FILTER article._id==relart.aid LIMIT @limit RETURN {'article':article,'no_of_paths':relart.no_of_paths}",
    #     bindVars={'depth': traversal_depth, 'cat': qa_category, 'articlekey': qa_key,
    #               'threshold_epochtime': threshold_epochtime, 'limit': no_of_results})


    # related_articles_query = adbclient.AQLQuery(
    #     "LET graph_rel_articles=(FOR term IN @top_terms FOR entity IN Entity FILTER entity.name==lower(term) FOR v,e,p IN @depth INBOUND entity GRAPH 'articleGraph' FILTER @cat IN v.category FILTER v._key!=@articlekey && (to_number(v.default.epoch_time)>(to_number(@query_epochtime)-to_number(@threshold_epochtime)) && to_number(v.default.epoch_time)<(to_number(@query_epochtime)+to_number(@threshold_epochtime))) COLLECT title=v.default.title WITH COUNT INTO no_of_paths RETURN {'title':title,'no_of_paths':no_of_paths})"
    #     "FOR relart IN graph_rel_articles SORT relart.no_of_paths DESC FOR article IN Article FILTER article.default.title==relart.title RETURN {'article':article,'no_of_paths':relart.no_of_paths}",
    #     bindVars={'top_terms': qa_topterms, 'depth': traversal_depth, 'cat': qa_category, 'articlekey': qa_key,
    #               'query_epochtime': qa_epochtime, 'threshold_epochtime': threshold_epochtime})

    related_articles = related_articles_query.response['result']

    ###iterate over return object to get specific attributes along with no_of_paths
    for i in range(len(related_articles)):
        resultobj = related_articles[i]

        ###get article obj and paths count
        articleobj = resultobj['article']
        no_of_paths = resultobj['no_of_paths']

        ###get required attributes from article object
        tempobj = {'articleID': articleobj['_key'], 'category': articleobj['category'], 'subcategory': articleobj['subcategory'], 'default': articleobj['default'],
                   'default_image': articleobj['default_image'], 'read': [articleobj['read'][0]], 'watch': [articleobj['watch'][0]], 'source_tags': articleobj['source_tags'],
                   'no_of_paths': no_of_paths}

        ###append it to return object
        path_articles.append(tempobj)

    return path_articles

    # related_articles_query = adbclient.AQLQuery(
    #     "LET epochtime_8hours=@epochtime FOR article IN Article FILTER article._key==@key LET query_epochtime=article.default.epoch_time LET related_docs=(FOR doc IN Document FILTER doc.url==article.default.url FOR v1,e1,p1 IN @depth OUTBOUND doc GRAPH 'newsGraph' FILTER e1.ne_tf>0 || e1.np_tf>0 || e1.ep_tf>0 FOR v2,e2,p2 IN @depth INBOUND v1 GRAPH 'newsGraph' FILTER v2._id!=doc._id && v2.source==doc.source COLLECT target_url=p2.vertices[1]['url'] WITH COUNT INTO no_of_paths SORT no_of_paths DESC LIMIT @limit RETURN {'url':target_url,'no_of_paths':no_of_paths}) FOR doc1 IN related_docs FOR article1 IN Article FILTER article1.default.url==doc1.url FILTER to_number(article1.default.epoch_time) > (to_number(query_epochtime)-to_number(epochtime_8hours)) && to_number(article1.default.epoch_time) < (to_number(query_epochtime)+to_number(epochtime_8hours)) SORT doc1.no_of_paths DESC RETURN {'articleID':article1._key,'category':article1.category,'subcategory':article1.subcategory,'default':article1.default,'default_image':article1.default_image,'read':[article1.read[0]],'watch':[article1.watch[0]],'source_tags':article1.source_tags,'no_of_paths':doc1.no_of_paths}",
    #     bindVars={'key': articlekey, 'depth': graph_depth, 'limit': limit, 'epochtime': epochtime}, batchSize=400)
    #
    # related_articles = related_articles_query.response['result']
    #
    # return related_articles


"""
function to get related articles through graph traversal which connects to entities common to query article
"""


def get_related_articles_graph(db_url, qa_topterms, qa_key, traversal_depth, qa_epochtime, qa_category, threshold_epochtime):
    """

    :param db_url: connection url for db
    :param qa_topterms: list of top terms from the query article
    :param qa_key: _key string of query article
    :param traversal_depth: depth till which graph traversal to be done
    :param qa_epochtime: query article epochtime (published time)
    :param qa_category: category of query article
    :param threshold_epochtime: limit epochtime for results
    :return: list of related articles
    """

    ###connecting to db
    adbclient, _ = instantiate_news_db(url=db_url)

    ###query to get related articles through depth graph traversal
    try:
        graph_traversal_query = adbclient.AQLQuery(
            "FOR term IN @top_terms FOR entity IN Entity FILTER entity.name==term FOR v,e,p IN @depth INBOUND entity GRAPH 'articleGraph' FILTER @cat IN v.category FILTER v._key!=@articlekey && (to_number(v.default.epoch_time)>(to_number(@query_epochtime)-to_number(@threshold_epochtime)) && to_number(v.default.epoch_time)<(to_number(@query_epochtime)+to_number(@threshold_epochtime))) RETURN DISTINCT {'articleID':v._key,'category':v.category,'subcategory':v.subcategory,'default':v.default,'default_image':v.default_image,'read':[v.read[0]],'watch':[v.watch[0]],'source_tags':v.source_tags}",
            bindVars={'top_terms': qa_topterms, 'depth': traversal_depth, 'cat': qa_category, 'articlekey': qa_key,
                      'query_epochtime': qa_epochtime, 'threshold_epochtime': threshold_epochtime})

        related_articles_graph = graph_traversal_query.response['result']

    except Exception:
        related_articles_graph = list()

    return related_articles_graph


"""
function to get related documents through cr/lr relations in graph
"""


def get_crlr_related_docs(db_url, doc_url, search_depth, edge_coll_name):
    """

    :param db_url: database connection url
    :param doc_url: query document url
    :param search_depth: depth for graph traversal
    :param edge_coll_name: edge collection name for graph search
    :return: array of crlr related docs
    """

    ###initializing variable
    crlr_related_docs = list()

    ###connecting to db
    adbclient, _ = instantiate_news_db(url=db_url)

    ###query to get related documents through crlr relation traversal in graph
    ###without using epochtime
    crlr_related_docs_query = adbclient.AQLQuery(
        "LET qarticle=(FOR article IN Article LET readobj=article.read LET readurls=(FOR read IN readobj RETURN read.url) FILTER @url IN readurls RETURN article) LET related_articles=(FOR article1 IN Article FILTER article1._id==qarticle[0]['_id'] FOR v,e,p IN @depth ANY article1 GRAPH 'newsGraph' FILTER SPLIT(e._id,'/')[0]==@edgeColl && v._id!=article1._id RETURN v) RETURN {'qarticle':qarticle,'related_articles':related_articles}",
        bindVars={'url': doc_url, 'depth': search_depth, 'edgeColl': edge_coll_name})


    ###using epochtime
    # crlr_related_docs_query = adbclient.AQLQuery("LET qarticle=(FOR article IN Article LET readobj=article.read LET readurls=(FOR read IN readobj RETURN read.url) FILTER @url IN readurls RETURN article) LET related_articles=(FOR article1 IN Article FILTER article1._id==qarticle[0]['_id'] FOR v,e,p IN @depth ANY article1 GRAPH 'newsGraph' FILTER SPLIT(e._id,'/')[0]==@edgeColl && v._id!=article1._id && (to_number(v.default.epoch_time)>(to_number(article1.default.epoch_time)-to_number(@threshold_epoch)) && to_number(v.default.epoch_time)<(to_number(article1.default.epoch_time)+to_number(@threshold_epoch))) RETURN v) RETURN {'qarticleID':qarticle[0]['_id'],'related_articles':related_articles}",
    #                                              bindVars={'url': doc_url, 'depth': search_depth, 'edgeColl': edge_coll_name, 'threshold_epoch': threshold_epoch})


    # crlr_related_docs_query = adbclient.AQLQuery(
    #     "FOR doc IN Document FILTER doc.url==@url LET related_articles=(FOR article IN Article FILTER article.default.title==doc.title FOR v,e,p IN @depth OUTBOUND article GRAPH 'newsGraph' FILTER SPLIT(e._id,'/')[0]==@edgeColl && v._id!=article._id SORT e.sim_value DESC LIMIT @limit RETURN v.default.title) FOR doc1 IN Document FILTER doc1.title IN related_articles && doc1.source==@source && (to_number(doc1.epoch_published)>(to_number(@query_epoch)-to_number(@threshold_epoch)) && to_number(doc1.epoch_published)<(to_number(@query_epoch)+to_number(@threshold_epoch))) RETURN DISTINCT doc1",
    #     bindVars={'url': doc_url, 'depth': search_depth, 'edgeColl': edge_coll_name, 'limit': no_of_results,
    #               'source': source, 'query_epochtime': query_doc_epoch, 'threshold_epoch': threshold_epoch})

    crlr_query_result = crlr_related_docs_query.response['result']

    ###iterate over query result to get specific attributes from resultant docs
    query_article = crlr_query_result[0]["qarticle"]
    related_articles = crlr_query_result[0]["related_articles"]
    # for i in range(len(related_docs)):
    #     docobj = related_docs[i]
    #     crlr_related_docs.append({'title': docobj['title'], 'url': docobj['url'], 'image': docobj['image']})

    return query_article, related_articles


"""
function to get related documents based on number of paths shared between
query documents and other documents
"""


def get_path_related_docs(db_url, query_article_id, search_depth, edge_coll_name, no_of_results):
    """

    :param db_url: db connection url
    :param query_article_id: query article id
    :param search_depth: search depth for traversal
    :param edge_coll_name: edge collection name
    :param no_of_results: no of return results from db -pagination
    :return: path related documents
    """

    ###initializing variable
    related_articles_arr = list()
    path_count_arr = list()

    ###connecting to db
    adbclient, _ = instantiate_news_db(url=db_url)

    ###query to get related documents based on paths connecting between query document and other documents
    path_related_docs_query = adbclient.AQLQuery("FOR article IN Article FILTER article._id==@id LET related_articles=(FOR v1,e1,p1 IN @depth ANY article GRAPH 'newsGraph' FILTER SPLIT(e1._id,'/')[0]==@edgeColl && v1._id!=article._id COLLECT artid=p1.vertices[2]['_id'] WITH COUNT INTO no_of_paths SORT no_of_paths LIMIT @limit RETURN {'articleid':artid,'no_of_paths':no_of_paths}) FOR result IN related_articles FOR article1 IN Article FILTER article1._id==result['articleid'] RETURN {'related_article':article1,'no_of_paths':result['no_of_paths']}",
                                                 bindVars={'id':query_article_id,'edgeColl':edge_coll_name,'depth':search_depth,'limit':no_of_results})


    # path_related_docs_query = adbclient.AQLQuery("FOR doc IN Document FILTER doc.url==@url LET related_docs=(FOR v1,e1,p1 IN @depth OUTBOUND doc GRAPH 'newsGraph' FILTER e1.ne_tf>0 || e1.np_tf>0 || e1.ep_tf>0 LET qd_tf_values=SUM([e1.ne_tf,e1.np_tf,e1.ep_tf]) SORT qd_tf_values DESC FOR v2,e2,p2 IN @depth INBOUND v1 GRAPH 'newsGraph' FILTER v2._id!=doc._id && v2.source==@source && (to_number(v2.epoch_published)>(to_number(@query_epoch)-to_number(@threshold_epoch)) && to_number(v2.epoch_published)<(to_number(@query_epoch)+to_number(@threshold_epoch))) COLLECT target_title=p2.vertices[1]['title'],target_url=p2.vertices[1]['url'],target_image=p2.vertices[1]['image'] WITH COUNT INTO no_of_paths RETURN {'title':target_title,'url':target_url,'image':target_image,'no_of_paths':no_of_paths}) FOR obj IN related_docs SORT obj.no_of_paths DESC FOR doc1 IN Document FILTER doc1.url==obj.url RETURN {'doc':doc1,'no_of_paths':obj.no_of_paths}",
    #                                              bindVars={'url': doc_url, 'depth': search_depth, 'source': source, 'query_epoch': query_doc_epoch, 'threshold_epoch': threshold_epoch})

    path_related_docs = path_related_docs_query.response['result']

    # ###iterate over query result to get required attributes from the resultant docs
    for i in range(len(path_related_docs)):
        related_article = path_related_docs[i]["related_article"]
        path_count = path_related_docs[i]["no_of_paths"]

        related_articles_arr.append(related_article)
        path_count_arr.append(path_count)

    # for i in range(len(related_docs)):
    #     docobj = related_docs[i]['doc']
    #     no_of_paths = related_docs[i]['no_of_paths']
    #
    #     ###form temp doc object before appending to output array
    #     temp_obj = {'title': docobj['title'], 'url': docobj['url'], 'image': docobj['image'], 'no_of_paths': no_of_paths}
    #
    #     path_related_docs.append(temp_obj)

    return related_articles_arr, path_count_arr


