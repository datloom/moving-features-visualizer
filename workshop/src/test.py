import json
import requests
from loguru import logger

class MFAPIHandler:
    def __init__(self, base_url):
        self.base_url = base_url

    def send_post_request(self, endpoint, data):
        url = self.base_url + endpoint
        response = requests.post(url, json=data)
        return response

    def send_get_request(self, endpoint, params=None):
        url = self.base_url + endpoint
        response = requests.get(url, params=params)
        return response.json()

    def send_put_request(self, endpoint, data):
        url = self.base_url + endpoint
        response = requests.put(url, json=data)
        return response

    def send_delete_request(self, endpoint):
        url = self.base_url + endpoint
        response = requests.delete(url)
        return response

    def delete_mf_collection(self, collection_id):
        endpoint = f"/collections/{collection_id}"
        url = self.base_url + endpoint
        headers = {
            'accept': '*/*',
            'Content-Type': 'application/json',
        }
        response = requests.delete(url, headers=headers)
        return response

    def register_new_mf_collection(self, json_data):
        endpoint = "/collections"
        url = self.base_url + endpoint
        response = requests.post(url, json=json_data)
        return response

    def post_mf_json(self, collection_id, json_data):
        url = f"{collection_id}/items"
        headers = {
            'accept': '*/*',
            'Content-Type': 'application/json',
        }
        response = requests.post(url, headers=headers, json=json_data)
        return response

    def post_mf_tgsequence(self, url, json_data):

        headers = {
            'accept': '*/*',
            'Content-Type': 'application/json',
        }
        response = requests.post(url, headers=headers, json=json_data)
        return response

    def get_mf_collection(self, collection_id):
        endpoint = f"/collections/{collection_id}/items"
        url = self.base_url + endpoint
        response = requests.get(url, params={"limit": 5})
        return response

    def get_mf(self, collection_id, feature_id):
        endpoint = f"/collections/{collection_id}/items/{feature_id}/tGeometries"
        url = self.base_url + endpoint
        response = requests.get(url)
        return response

    def get_mf_sequence(self, collection_id, feature_id, limit):
        endpoint = f"/collections/{collection_id}/items/{feature_id}/tgsequence"
        url = self.base_url + endpoint
        response = requests.get(url, params={"limit": limit})
        return response
if __name__ == "__main__":
    logger.info("Testing MFAPIHandler")
    mf_api_server = "http://localhost:5050"
    mfapi_handler = MFAPIHandler(mf_api_server)
    temp_id = "b71a9504-8872-4c47-a387-907feaa9d738"

    # Get Test
    mf_list_result = mfapi_handler.get_mf_collection(temp_id)
    mf_list = json.loads(mf_list_result.content)

    for each_feature in mf_list["features"]:
        each_feature_id = each_feature["id"]
        # if "0e21f2eb-7bd6-4731-a0ed-ad07fff66561" != each_feature_id:
        if "1a938231-232f-428c-a0c6-b2f0445b0e7d" != each_feature_id:
            continue
        print(each_feature)
        each_sq_result = mfapi_handler.get_mf_sequence(temp_id, each_feature_id, 5)
        each_sq = json.loads(each_sq_result.content)
        for each_tgsequence in each_sq["geometrySequence"]:
            print(each_tgsequence)
        # for each_tgsequence in each_sq["tgsequence"]:
        #     for each_coordi in each_tgsequence["coordinates"]:
        #         print(each_coordi)
        # print(each_sq["numberMatched"], each_sq["numberReturned"])

    # mf_collection_id = f"http://localhost:5050/collections/{temp_id}"
    # mf_json_data_path = "/Users/wijaecho/Desktop/Foss4gAsia2024/2026/workshop/mf-cesium/StinuumWeb/data/MF-JSON_prism/PracticeDataSet/mfjson_point_from_mobilitytwin.json"  # Path of MF-JSON data
    # sampling_size = 10
    # with open(mf_json_data_path, "r") as fp:
    #     mf_json_data = json.load(fp)
    # fp.close()
    # for each_key in mf_json_data:
    #     if each_key != "features":
    #         continue
    #     for each_feature in mf_json_data[each_key]:
    #         check = True
    #         total_size = len(each_feature["temporalGeometry"]["coordinates"])
    #         print(each_feature)
    #         if total_size // 10 > 4:
    #             store_url = ""
    #             while (len(each_feature["temporalGeometry"]["coordinates"]) > 0):
    #
    #                 if check:
    #                     tempFeature = {"type": "Feature", "properties": each_feature["properties"]}
    #                     tempGeometry = {
    #                         "type": each_feature["temporalGeometry"]["type"],
    #                         "coordinates": each_feature["temporalGeometry"]["coordinates"][:sampling_size],
    #                         "datetimes": each_feature["temporalGeometry"]["datetimes"][:sampling_size],
    #                         "interpolation": each_feature["temporalGeometry"]["interpolation"]
    #                     }
    #
    #                     tempFeature["temporalGeometry"] = tempGeometry
    #                     tempFeature["id"] = each_feature["id"]
    #                     result = mfapi_handler.post_mf_json(collection_id=mf_collection_id, json_data=tempFeature)
    #                     store_url = result.headers.get("location")
    #                     if result.status_code == 200 or result.status_code == 201:
    #                         print(f"Successfully registered the MF-JSON to MovingFeatureCollection")
    #                     else:
    #                         print(f"Failed to register the MF-JSON")
    #                     check = False
    #                 else:
    #                     each_sequence = {
    #                         "type": each_feature["temporalGeometry"]["type"],
    #                         "coordinates": each_feature["temporalGeometry"]["coordinates"][:sampling_size],
    #                         "datetimes": each_feature["temporalGeometry"]["datetimes"][:sampling_size],
    #                         "interpolation": each_feature["temporalGeometry"]["interpolation"]
    #                     }
    #                     tgsequence_url = f"{store_url}/tgsequence"
    #                     result = mfapi_handler.post_mf_tgsequence(url=tgsequence_url, json_data=each_sequence)
    #                     print(result.text)
    #                     if result.status_code == 200 or result.status_code == 201:
    #                         print(f"Successfully registered the MF-JSON to MovingFeatureCollection")
    #                     else:
    #                         print(f"Failed to register the MF-JSON")
    #
    #                 each_feature["temporalGeometry"]["coordinates"] = each_feature["temporalGeometry"][
    #                     "coordinates"][sampling_size:]
    #                 each_feature["temporalGeometry"]["datetimes"] = each_feature["temporalGeometry"]["datetimes"][
    #                     sampling_size:]
    #                 after_size_g = len(each_feature["temporalGeometry"]["coordinates"])
    #                 after_size_t = len(each_feature["temporalGeometry"]["coordinates"])
    #                 print(total_size, after_size_g, after_size_t)

            # else:
            #     result = mfapi_handler.post_mf_json(collection_id=mf_collection_id, json_data=mf_json_data[each_key])
            #     if result.status_code == 200 or result.status_code == 201:
            #         print(f"Successfully registered the MF-JSON to MovingFeatureCollection")
            #     else:
            #         print(f"Failed to register the MF-JSON")