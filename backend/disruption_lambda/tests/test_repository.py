from backend.disruption_lambda.repository import DynamoDisruptionRepository
from backend.disruption_lambda.tests.test_handler import VALID_EVENT


class FakeTable:
    def __init__(self):
        self.items = []
        self.query_responses = []
        self.update_attributes = None

    def put_item(self, **request):
        self.items.append(request["Item"])
        self.put_request = request

    def query(self, **request):
        self.query_request = request
        return self.query_responses.pop(0)

    def update_item(self, **request):
        self.update_request = request
        return {"Attributes": self.update_attributes}


class FakeDynamo:
    def __init__(self, table):
        self.table = table

    def Table(self, name):
        self.table_name = name
        return self.table


def _repository():
    table = FakeTable()
    dynamo = FakeDynamo(table)
    return DynamoDisruptionRepository("status-table", dynamo), table, dynamo


def test_create_uses_single_table_keys_and_sparse_active_index():
    repository, table, dynamo = _repository()
    event = {**VALID_EVENT, "id": "event-1", "isActive": True}

    created = repository.create(event)

    assert dynamo.table_name == "status-table"
    assert table.put_request["ConditionExpression"] == "attribute_not_exists(pk)"
    item = table.items[0]
    assert item["pk"] == "EVENT#event-1"
    assert item["sk"] == "EVENT"
    assert item["activeKey"] == "ACTIVE"
    assert created["id"] == "event-1"
    assert created["isActive"] is True


def test_list_active_paginates_the_sparse_index():
    repository, table, _ = _repository()
    repository.create({**VALID_EVENT, "id": "event-1", "isActive": True})
    item = table.items[0]
    table.query_responses = [
        {"Items": [item], "LastEvaluatedKey": {"pk": item["pk"], "sk": "EVENT"}},
        {"Items": []},
    ]

    events = repository.list_active()

    assert events[0]["id"] == "event-1"
    assert table.query_request["IndexName"] == "active-events"
    assert table.query_request["ExclusiveStartKey"]["pk"] == "EVENT#event-1"


def test_resolve_removes_event_from_active_index_and_sets_ttl():
    repository, table, _ = _repository()
    repository.create({**VALID_EVENT, "id": "event-1", "isActive": True})
    table.update_attributes = {**table.items[0], "status": "RESOLVED"}
    table.update_attributes.pop("activeKey")

    resolved = repository.resolve("event-1")

    assert resolved["isActive"] is False
    assert table.update_request["Key"] == {"pk": "EVENT#event-1", "sk": "EVENT"}
    assert "REMOVE activeKey" in table.update_request["UpdateExpression"]
    assert table.update_request["ExpressionAttributeValues"][":expires"] > 0
